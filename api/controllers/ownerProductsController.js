import supabase from "../../config/db.js";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

// Multer setup for handling image uploads
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// 🟩 Fetch all products for the owner’s store
export const getOwnerProducts = async (req, res) => {
  try {
    const userId = req.session?.user?.id;

    if (!userId) {
      console.error("⚠️ No active session found");
      return res.redirect("/login");
    }

    // 🔍 Step 1: Find the store that belongs to this owner
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("store_id, store_name, location")
      .eq("owner_id", userId)
      .maybeSingle();

    if (storeError) throw storeError;
    if (!store) {
      console.log("⚠️ No store found for owner ID:", userId);
      return res.render("OwnerSide/Products", {
        user: req.session.user,
        store: null,
        products: [],
        message: "No store found for this owner.",
      });
    }

    // 🔍 Step 2: Fetch all products for that store
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*")
      .eq("store_id", store.store_id)
      .order("id", { ascending: true });

    if (productsError) throw productsError;

    console.log("✅ Products fetched:", products?.length || 0);

    // 🔍 Step 3: Handle API (JSON) or render (HBS)
    if (req.xhr || req.headers.accept.includes("application/json")) {
      return res.status(200).json({ products });
    }

    // Render the Products page
    return res.render("OwnerSide/Products", {
      user: req.session.user,
      store,
      products,
    });

  } catch (err) {
    console.error("❌ Error fetching owner products:", err.message);
    res.status(500).render("errors/500", { message: "Failed to load products." });
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
