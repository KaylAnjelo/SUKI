import supabase from '../../config/db.js'; // fixed import (was importing non-existent supabaseClient.js)
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

// Multer setup for handling image uploads
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// 🟩 Fetch all products for the owner’s store
export async function getOwnerProducts(req, res) {
  try {
    const ownerId = req.session?.userId || req.session?.user?.id;
    if (!ownerId) return res.redirect('/login');

    const { data: stores, error: storesErr } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('owner_id', ownerId);
    if (storesErr) throw storesErr;

    const storeIds = (stores || []).map(s => s.store_id);
    if (!storeIds.length) {
      return res.render('OwnerSide/Products', { user: req.session?.user || null, products: [], store: null });
    }

    const { data: productsData, error: prodErr } = await supabase
      .from('products')
      .select('id, product_name, price, store_id, product_type, product_image')
      .in('store_id', storeIds)
      .order('id', { ascending: true });
    if (prodErr) throw prodErr;

    const products = (productsData || []).map(p => ({
      id: p.id,
      product_name: p.product_name,
      price: p.price,
      product_type: p.product_type,
      product_image: p.product_image
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

    const { productName, productCategory, productPrice } = req.body;
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
    const { error: insertError } = await supabase.from("products").insert([
      {
        product_name: productName,
        product_type: productCategory,
        price: productPrice,
        store_id: store.store_id,
        product_image: imageUrl,
      },
    ]);

    if (insertError) throw insertError;

    console.log("✅ Product added successfully");

    return res.redirect("/owner/products");
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

export default { getOwnerProducts };
