import supabase from "../../config/db.js";

export const getCustomers = async (req, res) => {
  try {
    const { data: customers, error } = await supabase
      .from('users')
      .select('user_id, username, contact_number, user_email')
      .order('user_id', { ascending: true });

    if (error) throw error;

    console.log("Customers:", customers);

    res.render('users/Customer', { customers });
  } catch (error) {
    console.error("Error fetching customers:", error.message);
    res.status(500).send('Server Error');
  }
};

export const getStores = async (req, res) => {
  try {
    const { data: stores, error } = await supabase
      .from('stores')
      .select('owner_id, store_name, is_active, store_code, owner_name, owner_contact, store_image')
      .order('owner_id', { ascending: true });

    if (error) throw error;

    res.render('users/Store', { stores });
  } catch (error) {
    console.error("Error fetching stores:", error.message);
    res.status(500).send('Server Error');
  }
};

export const addStore = async (req, res) => {
  try {
    const { storeName, ownerName, contactInfo, location } = req.body;

    let storeImage = null;
    if (req.file) {
      const file = req.file;
      const filePath = `stores/${Date.now()}_${file.originalname}`;

      // Upload image to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('store_image')
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicURL, error: urlError } = supabase.storage
        .from('store_image')
        .getPublicUrl(filePath);

      if (urlError) throw urlError;

      storeImage = publicURL.publicUrl;
    }

    // Insert store without manually setting store_code
    const { error } = await supabase.from('stores').insert([{
      store_name: storeName,
      owner_name: ownerName,
      owner_contact: contactInfo,
      store_image: storeImage,
      location: location || "Unknown",  // default if not provided
      is_active: true                   // default active
    }]);

    if (error) throw error;

    console.log("✅ Store added successfully");
    res.redirect('/users/store');
  } catch (error) {
    console.error("❌ Error adding store:", error.message);
    res.status(500).send('Server Error');
  }
};


export const deleteStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('stores').delete().eq("owner_id", id);

    if (error) throw error;

    res.redirect('/users/stores');
  } catch (error) {
    console.error("Error deleting store:", error.message);
    res.status(500).send('Server Error');
  }
};