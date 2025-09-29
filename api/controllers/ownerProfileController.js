import supabase from "../../config/db.js";

export const getOwnerProfileData = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.redirect('/login');
    }

    // Fetch user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_id, username, first_name, last_name, contact_number, user_email')
      .eq('user_id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).render("errors/404", { message: "User not found" });
    }

    // Fetch store details using owner_id
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('store_id, store_name, location, store_image, owner_name, owner_contact')
      .eq('owner_id', user.user_id) // ✅ match owner_id to user_id
      .single();

    if (storeError) {
      console.error("❌ Store fetch error:", storeError);
    }

    let vendors = [];
    if (store) {
      const { data: vendorData, error: vendorError } = await supabase
        .from("users")
        .select("user_id, username, first_name, last_name, contact_number, user_email")
        .eq("store_id", store.store_id)
        .eq("role", "vendor"); // ✅ only vendors

      if (vendorError) {
        console.error("❌ Vendor fetch error:", vendorError);
      } else {
        vendors = vendorData;
      }
    }

    console.log("👤 User data:", user);
    console.log("🏪 Store data:", store);
    console.log("🛍️ Vendors:", vendors);
    console.log("Rendering profile page with:", { user, store });

    return res.render("OwnerSide/Profile", {
      user,
      store,
      vendors
    });

  } catch (error) {
    console.error("❌ Error in getOwnerProfileData:", error);
    return res.status(500).render("errors/500", { message: "Internal server error" });
  }
};
