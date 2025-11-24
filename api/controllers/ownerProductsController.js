import supabase from '../../config/db.js'; // fixed import (was importing non-existent supabaseClient.js)
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

// For handling image uploads
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// Fetch all products for the owner’s store
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
        .select('id, product_name, price, store_id, product_type, product_image, product_description, product_active')
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
      product_image: p.product_image || null,
      product_description: p.product_description || '',
      product_active: p.product_active === true || p.product_active === 1 || p.product_active === '1' ? '1' : '0'
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

  // Form fields from the frontend
  const { productName, product_type, productPrice, productDescription, isActive } = req.body;
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

    // 🗃️ Insert product (include description and active flag)
    const { error: insertError } = await supabase.from("products").insert([
      {
        product_name: productName,
        product_type: product_type,
        price: productPrice,
        store_id: store.store_id,
        product_image: imageUrl,
        product_description: productDescription || null,
        product_active: isActive === '1' || isActive === 'true' || isActive === 1 ? true : false
      },
    ]);

    if (insertError) throw insertError;

  console.log("✅ Product added successfully");

  // Return JSON for AJAX requests
  return res.json({ success: true, message: 'Product added' });
  } catch (err) {
    console.error("❌ Error adding product:", err.message);
    res.status(500).render("errors/500", { message: "Failed to add product." });
  }
};

// 🟥 Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;

    console.log("🗑️ Product deleted:", id);
    return res.redirect("/owner/products");
  } catch (error) {
    console.error("❌ Error deleting product:", error);
    return res.status(500).render("errors/500", { message: "Failed to delete product." });
  }
};

// 🟨 Edit product
export const editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, product_type, productPrice, productDescription, isActive } = req.body;
    const file = req.file;

    // If a new image is provided, upload and set URL
    let imageUrl = null;
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

    const updatePayload = {
      product_name: productName,
      product_type: product_type,
      price: productPrice,
      product_description: productDescription || null,
      product_active: isActive === '1' || isActive === 'true' || isActive === 1 ? true : false
    };

    if (imageUrl) updatePayload.product_image = imageUrl;

    const { error: updateError } = await supabase.from('products').update(updatePayload).eq('id', id);
    if (updateError) throw updateError;

    console.log('✅ Product updated:', id);
    return res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    console.error('❌ Error updating product:', err.message || err);
    return res.status(500).json({ success: false, message: 'Failed to update product.' });
  }
};

export default { getOwnerProducts };
