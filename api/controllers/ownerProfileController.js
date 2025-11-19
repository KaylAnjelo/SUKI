import supabase from "../../config/db.js";
import bcrypt from "bcrypt";

export const getOwnerProfileData = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect('/');

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_id, username, first_name, last_name, contact_number, user_email')
      .eq('user_id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).render("errors/404", { message: "User not found" });
    }

    // Fetch all stores owned by the user
    const { data: stores } = await supabase
      .from('stores')
      .select('store_id, store_name, location, store_image, owner_name, owner_contact')
      .eq('owner_id', user.user_id);

    // Get selected store from query param or use first store
    const selectedStoreId = req.query.store_id ? parseInt(req.query.store_id) : null;
    let store = null;
    
    if (selectedStoreId && stores) {
      store = stores.find(s => s.store_id === selectedStoreId);
    }
    
    // Fallback to first store if no valid selection
    if (!store && stores && stores.length > 0) {
      store = stores[0];
    }

    // Mark selected store in stores array
    const storesWithSelection = (stores || []).map(s => ({
      ...s,
      is_selected: s.store_id === store?.store_id
    }));

    let vendors = [];
    if (store) {
      const { data: vendorData } = await supabase
        .from("users")
        .select("user_id, username, first_name, last_name, contact_number, user_email")
        .eq("store_id", store.store_id)
        .eq("role", "vendor");
      vendors = vendorData || [];
    }

    // Detect if request expects JSON (AJAX)
    if (req.headers.accept?.includes('application/json') || req.xhr) {
      return res.json({ user, store, stores: storesWithSelection, vendors }); // ✅ send JSON response
    }

    // Otherwise render the page
    return res.render("OwnerSide/Profile", { user, store, stores: storesWithSelection, vendors });

  } catch (error) {
    console.error("❌ Error in getOwnerProfileData:", error);
    return res.status(500).render("errors/500", { message: "Internal server error" });
  }
};
/**
 * PUT - Update owner profile data (API endpoint)
 */
export const updateOwnerProfile = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    const { ownerName, contactNumber, email } = req.body;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // ✅ Update user info
    const { error: userError } = await supabase
      .from("users")
      .update({
        contact_number: contactNumber,
        user_email: email,
      })
      .eq("user_id", userId);

    if (userError) {
      console.error("❌ Failed to update user:", userError);
      return res.status(500).json({ error: "Failed to update user data" });
    }

    // ✅ Update owner_name in all stores owned by this user
    if (ownerName) {
      const { error: storeError } = await supabase
        .from("stores")
        .update({ owner_name: ownerName })
        .eq("owner_id", userId);

      if (storeError) {
        console.error("❌ Failed to update store owner name:", storeError);
        // Don't fail the entire request if this fails
      }
    }

    res.json({
      success: true,
      message: "Profile updated successfully"
    });
  } catch (error) {
    console.error("❌ Error in updateOwnerProfile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST - Change owner password
 */
export const changeOwnerPassword = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" });
    }

    // Fetch user's current password hash
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("password")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      console.error("❌ Failed to fetch user:", userError);
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const { error: updateError } = await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("user_id", userId);

    if (updateError) {
      console.error("❌ Failed to update password:", updateError);
      return res.status(500).json({ error: "Failed to update password" });
    }

    console.log("✅ Password changed successfully for user:", userId);
    res.json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (error) {
    console.error("❌ Error in changeOwnerPassword:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
