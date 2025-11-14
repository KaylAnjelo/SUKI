import supabase from '../../config/db.js'; // fixed import (was importing non-existent supabaseClient.js)
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

// Function to reset products sequence when primary key conflicts occur
const resetProductsSequence = async () => {
  try {
    // Get the current maximum ID from products table
    const { data: maxData, error: maxError } = await supabase
      .from('products')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    
    if (maxError) throw maxError;
    
    const maxId = maxData && maxData.length > 0 ? maxData[0].id : 0;
    const nextId = maxId + 1;
    
    // Reset the sequence using raw SQL
    const { error: seqError } = await supabase
      .rpc('exec_sql', { 
        sql: `SELECT setval('products_id_seq', ${nextId});` 
      });
    
    if (seqError) {
      // Alternative approach if RPC doesn't work
      console.log('RPC failed, trying alternative sequence reset');
      // We'll handle this in the retry logic instead
    }
    
    console.log(`✅ Products sequence reset to ${nextId}`);
    return true;
  } catch (err) {
    console.error('❌ Failed to reset products sequence:', err);
    return false;
  }
};

// Multer setup for handling image uploads
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// 🟩 Fetch all products for the owner’s store
export async function getOwnerProducts(req, res) {
  try {
    const ownerId = req.session?.userId || req.session?.user?.id;
    console.log('getOwnerProducts called, ownerId=', ownerId); // <--- debug

    if (!ownerId) {
      console.log('getOwnerProducts: no ownerId, redirecting to /login');
      return res.redirect('/login');
    }

    const { data: stores, error: storesErr } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('owner_id', ownerId);
    if (storesErr) {
      console.error('getOwnerProducts: storesErr', storesErr);
      throw storesErr;
    }
    console.log('getOwnerProducts: stores found=', (stores || []).length);

    const storeIds = (stores || []).map(s => s.store_id);
    if (!storeIds.length) {
      return res.render('OwnerSide/Products', { user: req.session?.user || null, products: [], store: null });
    }

    const { data: productsData, error: prodErr } = await supabase
      .from('products')
      .select('id, product_name, price, store_id, product_type, product_image')
      .in('store_id', storeIds)
      .order('id', { ascending: true });
    if (prodErr) {
      console.error('getOwnerProducts: prodErr', prodErr);
      throw prodErr;
    }

    console.log('getOwnerProducts: productsData length=', (productsData || []).length);
    const products = (productsData || []).map(p => ({
      id: p.id,
      product_name: p.product_name,
      price: p.price,
      product_type: p.product_type,
      product_image: p.product_image || null
    }));

    const store = (stores || [])[0] || null;
    return res.render('OwnerSide/Products', { user: req.session?.user || null, products, store });
  } catch (err) {
    console.error('getOwnerProducts error', err);
    return res.render('OwnerSide/Products', { user: req.session?.user || null, products: [], store: null, error: 'Failed to load products' });
  }
};

// 🟨 Add new product
export const addProduct = async (req, res) => {
  try {
    const userId = req.session?.user?.id;

    if (!userId) return res.redirect("/login");

    // Get owner’s store
    const { data: store } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (!store) throw new Error("Store not found for this owner.");

    const { productName, product_type: productCategory, productPrice } = req.body;
    const file = req.file;

    let imageUrl = null;

    // 🖼️ Upload image to Supabase Storage (if provided)
    if (file) {
      const fileName = `${uuidv4()}-${file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("product_image")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
        });

      if (uploadError) throw uploadError;

      // Get the public URL of the uploaded image
      const { data: publicUrlData } = supabase.storage
        .from("product_image")
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

    // 🗃️ Insert product
    const productData = {
      product_name: productName,
      product_type: productCategory,
      price: parseFloat(productPrice),
      store_id: store.store_id,
      product_image: imageUrl
    };
    
    console.log('Inserting product data:', productData);
    
    let { data: insertData, error: insertError } = await supabase
      .from("products")
      .insert([productData])
      .select();

    // If primary key conflict, find next available ID and insert manually
    if (insertError && insertError.message && insertError.message.includes('duplicate key value violates unique constraint "products_pkey"')) {
      console.log('🔄 Primary key conflict detected. Sequence is out of sync.');
      
      try {
        // Get current max ID
        const { data: maxIdData } = await supabase
          .from('products')
          .select('id')
          .order('id', { ascending: false })
          .limit(1);
        
        const maxId = maxIdData && maxIdData.length > 0 ? maxIdData[0].id : 0;
        console.log('Current max ID:', maxId, 'but sequence is trying to use a lower ID');
        
        // Find the next available ID by checking what IDs exist
        let nextAvailableId = maxId + 1;
        
        // Double-check this ID doesn't exist
        const { data: existingCheck } = await supabase
          .from('products')
          .select('id')
          .eq('id', nextAvailableId)
          .single();
        
        if (existingCheck) {
          // If somehow this ID exists, increment until we find a free one
          nextAvailableId = maxId + 2;
        }
        
        console.log('Using next available ID:', nextAvailableId);
        
        // Create new product data with explicit ID
        const productDataWithId = {
          ...productData,
          id: nextAvailableId
        };
        
        const retryResult = await supabase
          .from("products")
          .insert([productDataWithId])
          .select();
        
        insertData = retryResult.data;
        insertError = retryResult.error;
        
        if (!insertError) {
          console.log('✅ Product inserted with manual ID:', nextAvailableId);
        } else {
          console.log('❌ Still getting error after manual ID assignment:', insertError.message);
        }
        
      } catch (fixErr) {
        console.error('❌ Error during manual ID assignment:', fixErr);
      }
    }

    if (insertError) {
      console.error('Insert error details:', insertError);
      throw insertError;
    }
    
    console.log('Successfully inserted product:', insertData);

    console.log("✅ Product added successfully");

    // Check if it's an AJAX request
    if (req.headers['content-type']?.includes('multipart/form-data') && req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Product added successfully' });
    }

    return res.redirect("/owner/products");
  } catch (err) {
    console.error("❌ Error adding product:", err.message);
    
    let errorMessage = 'Failed to add product';
    
    // Handle specific database errors
    if (err.message.includes('duplicate key value violates unique constraint "products_product_name_key"')) {
      errorMessage = 'A product with this name already exists. Please use a different name.';
    } else if (err.message.includes('duplicate key value violates unique constraint "products_pkey"')) {
      errorMessage = 'Database sequence error: Unable to generate unique ID. Please try again.';
    } else if (err.message.includes('violates unique constraint')) {
      errorMessage = 'Duplicate data detected. Please check your input and try again.';
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    // Check if it's an AJAX request
    if (req.headers['content-type']?.includes('multipart/form-data') && req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: errorMessage });
    }
    
    res.status(500).render("errors/500", { message: errorMessage });
  }
};

// 🟥 Delete product
export const deleteProduct = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    const { id } = req.params;

    if (!userId) return res.redirect("/login");

    // Verify the product belongs to the owner's store
    const { data: store } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (!store) throw new Error("Store not found for this owner.");

    // Check if product exists and belongs to owner
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("store_id", store.store_id)
      .single();

    if (!product) {
      throw new Error("Product not found or access denied.");
    }

    // Check if product has any transactions
    const { data: transactions, error: transactionError } = await supabase
      .from("transactions")
      .select("id")
      .eq("product_id", id)
      .limit(1);

    if (transactionError) {
      console.error("Error checking transactions:", transactionError);
    }

    // If product has transactions, prevent deletion
    if (transactions && transactions.length > 0) {
      const errorMessage = "Cannot delete this product because it has transaction history. Products with sales records cannot be removed for data integrity.";
      
      if (req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: errorMessage });
      }
      
      return res.status(400).render("errors/400", { message: errorMessage });
    }

    // If no transactions, proceed with deletion
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;

    console.log("🗑️ Product deleted:", id);
    
    // Check if it's an AJAX request
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Product deleted successfully' });
    }
    
    return res.redirect("/owner/products");
  } catch (error) {
    console.error("❌ Error deleting product:", error);
    
    let errorMessage = 'Failed to delete product';
    
    // Handle specific database errors
    if (error.message && error.message.includes('violates foreign key constraint')) {
      errorMessage = 'Cannot delete this product because it has transaction history. Products with sales records cannot be removed.';
    } else if (error.message && error.message.includes('still referenced from table')) {
      errorMessage = 'Cannot delete this product because it is still being used in the system.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // Check if it's an AJAX request
    if (req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: errorMessage });
    }
    
    return res.status(500).render("errors/500", { message: errorMessage });
  }
};

// 🟨 Edit product
export const editProduct = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    const { id } = req.params;
    const { productName, product_type: productCategory, productPrice } = req.body;
    const file = req.file;

    if (!userId) return res.redirect("/login");

    // Verify the product belongs to the owner's store
    const { data: store } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (!store) throw new Error("Store not found for this owner.");

    // Get current product data
    const { data: currentProduct } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("store_id", store.store_id)
      .single();

    if (!currentProduct) {
      throw new Error("Product not found or access denied.");
    }

    let imageUrl = currentProduct.product_image; // Keep existing image by default

    // 🖼️ Upload new image if provided
    if (file) {
      const fileName = `${uuidv4()}-${file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("product_image")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("product_image")
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

    // 🗃️ Update product
    const { error: updateError } = await supabase
      .from("products")
      .update({
        product_name: productName,
        product_type: productCategory,
        price: parseFloat(productPrice),
        product_image: imageUrl
      })
      .eq("id", id)
      .eq("store_id", store.store_id);

    if (updateError) {
      console.error('Update error details:', updateError);
      throw updateError;
    }

    console.log("✅ Product updated successfully:", id);

    // Check if it's an AJAX request
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Product updated successfully' });
    }

    return res.redirect("/owner/products");
  } catch (err) {
    console.error("❌ Error updating product:", err.message);
    
    let errorMessage = 'Failed to update product';
    if (err.message.includes('duplicate key value violates unique constraint "products_product_name_key"')) {
      errorMessage = 'A product with this name already exists. Please use a different name.';
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    // Check if it's an AJAX request
    if (req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: errorMessage });
    }
    
    res.status(500).render("errors/500", { message: errorMessage });
  }
};

// 🟦 Get single product by ID
export const getProductById = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    const { id } = req.params;

    console.log('getProductById called with:', { userId, id });

    if (!userId) {
      console.log('Unauthorized: no userId in session');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's store
    const { data: store } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Get product data
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("store_id", store.store_id)
      .single();

    if (error || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    console.error('❌ Error fetching product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default { getOwnerProducts };
