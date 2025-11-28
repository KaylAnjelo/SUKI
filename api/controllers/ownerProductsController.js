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

// 🟩 Fetch all products for the owner's store
export async function getOwnerProducts(req, res) {
  try {
    const ownerId = req.session?.userId || req.session?.user?.id;
    console.log('getOwnerProducts called, ownerId=', ownerId); // <--- debug

    if (!ownerId) {
      console.log('getOwnerProducts: no ownerId, redirecting to /login');
      return res.redirect('/');
    }

    // Fetch fresh user data including profile_image
    const { data: freshUser } = await supabase
      .from('users')
      .select('user_id, username, first_name, last_name, contact_number, user_email, profile_image')
      .eq('user_id', ownerId)
      .single();

    const { data: stores, error: storesErr } = await supabase
      .from('stores')
      .select('store_id, store_name, store_image')
      .eq('owner_id', ownerId);
    if (storesErr) {
      console.error('getOwnerProducts: storesErr', storesErr);
      throw storesErr;
    }
    console.log('getOwnerProducts: stores found=', (stores || []).length);

    // Get selected store from query param
    let selectedStoreId = req.query.store_id ? parseInt(req.query.store_id) : null;
    // Get filtering params from query
    const q = req.query.q ? String(req.query.q).trim() : null;
    const category = req.query.category ? String(req.query.category) : null;
    let store = null;

    const storeIds = (stores || []).map(s => s.store_id);

    // If no specific store requested, default to the first store so the page shows that store's products
    if ((!selectedStoreId || Number.isNaN(selectedStoreId)) && storeIds.length > 0) {
      selectedStoreId = storeIds[0];
    }

    if (selectedStoreId && stores) {
      store = stores.find(s => s.store_id === selectedStoreId);
    }

    // Mark selected store in stores array
    const storesWithSelection = (stores || []).map(s => ({
      ...s,
      is_selected: selectedStoreId && s.store_id === selectedStoreId
    }));

    console.log('selectedStoreId:', selectedStoreId);
    console.log('storesWithSelection:', storesWithSelection.map(s => ({ id: s.store_id, name: s.store_name, selected: s.is_selected })));

    // If owner has no stores, render with empty products
    if (!storeIds || storeIds.length === 0) {
      return res.render('OwnerSide/Products', {
        user: freshUser || req.session?.user || null,
        products: [],
        store: null,
        stores: storesWithSelection,
        selectedStoreId: null,
        currentPage: 1,
        totalPages: 0,
        timestamp: Date.now(),
        q: '',
        category: ''
      });
    }

    // If a specific store is selected, filter only that store. Otherwise include all owner's stores.
    const targetStoreIds = selectedStoreId ? [selectedStoreId] : storeIds;

    // Build product query with filters and return the full result set (no pagination)
    let prodQuery = supabase
      .from('products')
      .select('id, product_name, price, store_id, product_type, product_image, stores(store_name)')
      .in('store_id', targetStoreIds);

    if (q) prodQuery = prodQuery.ilike('product_name', `%${q}%`);
    if (category) prodQuery = prodQuery.eq('product_type', category);

    const { data: productsData, error: prodErr } = await prodQuery
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
      product_image: p.product_image || null,
      store_id: p.store_id,
      store_name: p.stores?.store_name || 'Unknown Store'
    }));

    // When listing all products on one page, pagination is not used; indicate single page
    return res.render('OwnerSide/Products', { 
      user: freshUser || req.session?.user || null, 
      products, 
      store, 
      stores: storesWithSelection, 
      selectedStoreId, 
      currentPage: 1, 
      totalPages: 1, 
      timestamp: Date.now(),
      // echo back filters so template can preserve them in forms/links
      q: q || '',
      category: category || ''
    });
  } catch (err) {
    console.error('getOwnerProducts error', err);
    return res.render('OwnerSide/Products', { user: req.session?.user || null, products: [], store: null, stores: [], selectedStoreId: null, currentPage: 1, totalPages: 0, error: 'Failed to load products', timestamp: Date.now() });
  }
};

 

// 🟨 Add new product
export const addProduct = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;

    if (!userId) return res.redirect("/login");

    const { productName, product_type: productCategory, productPrice, store_id } = req.body;

    // Validate that store_id is provided and belongs to the owner
    if (!store_id) {
      throw new Error("Store selection is required. Please select a specific store.");
    }

    const storeId = parseInt(store_id);

    // Verify the store belongs to this owner
    const { data: storeCheck, error: storeError } = await supabase
      .from("stores")
      .select("store_id")
      .eq("store_id", storeId)
      .eq("owner_id", userId)
      .single();

    if (storeError || !storeCheck) {
      throw new Error("Store not found or access denied.");
    }
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
      store_id: storeId,
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
    const userId = req.session?.userId || req.session?.user?.id;
    const { id } = req.params;

    if (!userId) return res.redirect("/login");

    // Get owner's stores to verify ownership
    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", userId);

    if (storesError || !stores || stores.length === 0) {
      throw new Error("No stores found for this owner.");
    }

    const ownerStoreIds = stores.map(s => s.store_id);

    // Check if product exists and belongs to owner's stores
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .in("store_id", ownerStoreIds)
      .single();

    if (productError || !product) {
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
      // Always send JSON if error view does not exist
      return res.status(400).json({ success: false, message: errorMessage });
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
    const userId = req.session?.userId || req.session?.user?.id;
    const { id } = req.params;
    const { productName, product_type: productCategory, productPrice } = req.body;
    const file = req.file;

    if (!userId) return res.redirect("/login");

    // Get owner's stores to verify ownership
    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", userId);

    if (storesError || !stores || stores.length === 0) {
      throw new Error("No stores found for this owner.");
    }

    const ownerStoreIds = stores.map(s => s.store_id);

    // Get current product data and verify it belongs to owner's stores
    const { data: currentProduct, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .in("store_id", ownerStoreIds)
      .single();

    if (productError || !currentProduct) {
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

    // 🗃️ Update product (keep original store_id)
    const { error: updateError } = await supabase
      .from("products")
      .update({
        product_name: productName,
        product_type: productCategory,
        price: parseFloat(productPrice),
        product_image: imageUrl
      })
      .eq("id", id)
      .eq("store_id", currentProduct.store_id);

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
    const userId = req.session?.userId || req.session?.user?.id;
    const { id } = req.params;

    console.log('getProductById called with:', { userId, id });

    if (!userId) {
      console.log('Unauthorized: no userId in session');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's stores to verify ownership
    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", userId);

    if (storesError || !stores || stores.length === 0) {
      return res.status(404).json({ error: 'No stores found for this owner' });
    }

    const ownerStoreIds = stores.map(s => s.store_id);

    // Get product data and verify it belongs to owner's stores
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .in("store_id", ownerStoreIds)
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

// Return all owner's products as JSON (useful for API consumers)
export const getOwnerProductsJson = async (req, res) => {
  try {
    const ownerId = req.session?.userId || req.session?.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: stores, error: storesErr } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', ownerId);
    if (storesErr) throw storesErr;

    const storeIds = (stores || []).map(s => s.store_id);

    if (!storeIds || storeIds.length === 0) {
      return res.json({ products: [] });
    }

    const q = req.query.q ? String(req.query.q).trim() : null;
    const category = req.query.category ? String(req.query.category) : null;

    let prodQuery = supabase
      .from('products')
      .select('id, product_name, price, store_id, product_type, product_image, stores(store_name)')
      .in('store_id', storeIds);

    if (q) prodQuery = prodQuery.ilike('product_name', `%${q}%`);
    if (category) prodQuery = prodQuery.eq('product_type', category);

    const { data: productsData, error: prodErr } = await prodQuery.order('id', { ascending: true });
    if (prodErr) throw prodErr;

    const products = (productsData || []).map(p => ({
      id: p.id,
      product_name: p.product_name,
      price: p.price,
      product_type: p.product_type,
      product_image: p.product_image || null,
      store_id: p.store_id,
      store_name: p.stores?.store_name || 'Unknown Store'
    }));

    return res.json({ products });
  } catch (err) {
    console.error('getOwnerProductsJson error', err);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
};
