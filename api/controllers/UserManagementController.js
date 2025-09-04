import supabase from "../../config/db.js";

// Test database connection
export const testConnection = async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic connection
    const { data, error } = await supabase
      .from('stores')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection error:', error);
      return res.status(500).json({ 
        error: 'Database connection failed', 
        details: error.message 
      });
    }
    
    console.log('✅ Database connection successful');
    res.json({ 
      success: true, 
      message: 'Database connection successful',
      data: data
    });
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    res.status(500).json({ 
      error: 'Unexpected error', 
      message: error.message 
    });
  }
};

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
      try {
        const file = req.file;
        const filePath = `stores/${Date.now()}_${file.originalname}`;

        console.log('📁 Attempting to upload file:', file.originalname);
        console.log('📂 Target bucket: store_image');
        console.log('📄 File path:', filePath);

        // Upload image to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('store_image')
          .upload(filePath, file.buffer, { contentType: file.mimetype });

        if (uploadError) {
          console.error('❌ Storage upload error:', uploadError);
          if (uploadError.message.includes('Bucket not found')) {
            throw new Error('Storage bucket "store_image" not found. Please create it in your Supabase dashboard under Storage.');
          }
          throw uploadError;
        }

        console.log('✅ File uploaded successfully');

        // Get public URL
        const { data: publicURL, error: urlError } = supabase.storage
          .from('store_image')
          .getPublicUrl(filePath);

        if (urlError) {
          console.error('❌ Public URL error:', urlError);
          throw urlError;
        }

        storeImage = publicURL.publicUrl;
        console.log('🔗 Public URL generated:', storeImage);
      } catch (imageError) {
        console.error('❌ Image processing error:', imageError);
        // Continue without image if there's an error
        storeImage = null;
        console.log('⚠️ Continuing without image upload');
      }
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
    // Return JSON response instead of redirecting
    res.json({ 
      success: true, 
      message: 'Store added successfully',
      store: {
        store_name: storeName,
        owner_name: ownerName,
        owner_contact: contactInfo,
        location: location || "Unknown"
      }
    });
  } catch (error) {
    console.error("❌ Error adding store:", error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Server Error',
      message: error.message 
    });
  }
};


export const deleteStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('stores').delete().eq("owner_id", id);

    if (error) throw error;

    // Return JSON response instead of redirecting
    res.json({ 
      success: true, 
      message: 'Store deleted successfully',
      deletedId: id
    });
  } catch (error) {
    console.error("Error deleting store:", error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Server Error',
      message: error.message 
    });
  }
};