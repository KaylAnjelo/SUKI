import EmailService from '../../../MyApp/services/emailService.js';
// Store codes in-memory for demo (use DB/Redis for production)
const emailCodes = new Map();

export const sendPasswordChangeCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    // Store code with expiry (10 min)
    emailCodes.set(email, { code, expires: Date.now() + 10 * 60 * 1000 });
    // Send code via email
    await EmailService.sendOTP(email, code);
    return res.json({ success: true, message: 'Verification code sent to email.' });
  } catch (err) {
    console.error('Error sending password change code:', err);
    return res.status(500).json({ error: 'Failed to send code.' });
  }
};

export const verifyPasswordChangeCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code required.' });
    const entry = emailCodes.get(email);
    if (!entry || entry.code !== code || entry.expires < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired code.' });
    }
    // Optionally remove code after verification
    emailCodes.delete(email);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error verifying code:', err);
    return res.status(500).json({ error: 'Failed to verify code.' });
  }
};
import supabase from "../../config/db.js";
import bcrypt from "bcrypt";

export const getOwnerProfileData = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect('/');

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_id, username, first_name, last_name, contact_number, user_email, profile_image')
      .eq('user_id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).render("errors/404", { message: "User not found" });
    }

    // Fetch all stores owned by the user, including store_code
    const { data: stores } = await supabase
      .from('stores')
      .select('store_id, store_name, location, store_image, owner_name, owner_contact, store_code')
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

    // Determine vendor scope: if a specific store is selected, use it; otherwise use all owner's stores
    let vendors = [];
    try {
      const storeIds = (stores || []).map(s => s.store_id).filter(Boolean);
      if (storeIds.length > 0) {
        const targetStoreIds = selectedStoreId ? [selectedStoreId] : storeIds;
        const { data: vendorData, error: vendorErr } = await supabase
          .from('users')
          .select('user_id, username, first_name, last_name, contact_number, user_email, profile_image, role, store_id')
          .in('store_id', targetStoreIds)
          .eq('role', 'vendor')
          .order('first_name', { ascending: true });

        if (vendorErr) {
          console.error('getOwnerProfileData: vendorErr', vendorErr);
        } else {
          // Enrich vendors with store_name for easier rendering in the template
          const storeMap = (stores || []).reduce((acc, s) => {
            acc[s.store_id] = s.store_name;
            return acc;
          }, {});

          vendors = (vendorData || []).map(v => ({
            ...v,
            store_name: storeMap[v.store_id] || 'Unknown Store'
          }));
        }
      }
    } catch (vErr) {
      console.error('Error fetching vendors:', vErr);
      vendors = [];
    }

    // Detect if request expects JSON (AJAX)
    if (req.headers.accept?.includes('application/json') || req.xhr) {
      return res.json({ user, store, stores: storesWithSelection, vendors, timestamp: Date.now() }); // ✅ send JSON response
    }

    // Otherwise render the page
    return res.render("OwnerSide/Profile", { user, store, stores: storesWithSelection, vendors, timestamp: Date.now() });

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
    const { ownerName, contactNumber, email, storeId, removePhoto } = req.body;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // ✅ Update user info (contact + email)
    const updateUserData = {
      contact_number: contactNumber,
      user_email: email,
    };

    // If ownerName provided, try to split into first/last and update user names as well
    if (ownerName) {
      const parts = ownerName.trim().split(/\s+/);
      if (parts.length === 1) {
        updateUserData.first_name = parts[0];
        updateUserData.last_name = null;
      } else {
        updateUserData.first_name = parts.shift();
        updateUserData.last_name = parts.join(' ');
      }
    }

    const { error: userError } = await supabase
      .from("users")
      .update(updateUserData)
      .eq("user_id", userId);

    if (userError) {
      console.error("❌ Failed to update user:", userError);
      return res.status(500).json({ error: "Failed to update user data" });
    }

    // ✅ Update owner_name in all stores owned by this user (keep store-level owner_name in sync)
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

    // Handle profile photo upload or removal. Owner modal sends owner photo (no storeId)
    try {
      const targetStoreId = storeId ? parseInt(storeId) : null;

      // If a file is uploaded and no storeId provided, treat as owner/user profile image
      if (req.file && !targetStoreId) {
        const file = req.file;
        const filePath = `profile_photos/${Date.now()}_${file.originalname}`;
        console.log('📤 Uploading owner profile photo:', filePath);

        const { error: uploadError } = await supabase.storage
          .from('store_image')
          .upload(filePath, file.buffer, { contentType: file.mimetype });

        if (uploadError) {
          console.error('❌ Error uploading owner profile photo:', uploadError);
        } else {
          const { data: publicURL, error: urlError } = await supabase.storage
            .from('store_image')
            .getPublicUrl(filePath);

          console.log('✅ Owner photo uploaded. Public URL:', publicURL?.publicUrl);
          
          if (!urlError && publicURL && publicURL.publicUrl) {
            // Save URL to users.profile_image
            const updateResult = await supabase.from('users').update({ profile_image: publicURL.publicUrl }).eq('user_id', userId);
            console.log('✅ Saved to users.profile_image for userId:', userId, updateResult);
            // Also update session so header shows the new image immediately
            if (req.session && req.session.user) {
              req.session.user.profile_image = publicURL.publicUrl;
            }
          }
        }

      // If removePhoto and no storeId, remove user's profile image
      } else if (removePhoto === 'true' && !targetStoreId) {
        await supabase.from('users').update({ profile_image: null }).eq('user_id', userId);
          if (req.session && req.session.user) {
            req.session.user.profile_image = null;
          }

      // If storeId present, keep previous behavior (update store image)
      } else if (req.file && targetStoreId) {
        const file = req.file;
        const filePath = `profile_photos/${Date.now()}_${file.originalname}`;

        const { error: uploadError } = await supabase.storage
          .from('store_image')
          .upload(filePath, file.buffer, { contentType: file.mimetype });

        if (uploadError) {
          console.error('❌ Error uploading store profile photo:', uploadError);
        } else {
          const { data: publicURL, error: urlError } = await supabase.storage
            .from('store_image')
            .getPublicUrl(filePath);

          if (!urlError && publicURL && publicURL.publicUrl) {
            await supabase.from('stores').update({ store_image: publicURL.publicUrl }).eq('store_id', targetStoreId);
          }
        }

      } else if (removePhoto === 'true' && targetStoreId) {
        await supabase.from('stores').update({ store_image: null }).eq('store_id', parseInt(storeId));
      }
    } catch (photoErr) {
      console.error('❌ Error handling profile photo:', photoErr);
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
