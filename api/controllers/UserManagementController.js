import supabase from "../../config/db.js";
import bcrypt from "bcrypt";

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
      .select('user_id, username, contact_number, user_email, first_name, last_name')
      .eq('role', 'customer')
      .order('user_id', { ascending: true });

    if (error) throw error;

    // Add full_name property to each customer
    const customersWithFullName = customers.map(c => ({
      ...c,
      full_name: `${c.first_name} ${c.last_name}`
    }));

    console.log("Customers:", customersWithFullName);

    res.render('users/Customer', { customers: customersWithFullName });
  } catch (error) {
    console.error("Error fetching customers:", error.message);
    res.status(500).send('Server Error');
  }
};


export const getVendors = async (req, res) => {
    try {
      const { data: vendors, error } = await supabase
    .from('users')
    .select('user_id, username, contact_number, user_email, role, store_id')
    .eq('role', 'vendor')
    .order('user_id', { ascending: true });

  if (error) throw error;

  const { data: stores, error: storesError } = await supabase
    .from('stores')
    .select('store_id, store_name');

  if (storesError) throw storesError;

  const vendorsWithStores = vendors.map(vendor => {
    const store = stores.find(s => s.store_id === vendor.store_id);
    return {
      ...vendor,
      store_name: store ? store.store_name : 'N/A'
    };
  });

      

    res.render('users/Vendor', { vendors: vendorsWithStores });
  } catch (error) {
    console.error("Error fetching vendors:", error.message);
    res.status(500).send('Server Error');
  }
};


export const getStores = async (req, res) => {
  try {
    const { data: stores, error } = await supabase
      .from('stores')
      .select('store_id, owner_id, store_name, is_active, store_code, owner_name , owner_contact, store_image, location')
      .order('store_id', { ascending: true });

    if (error) throw error;

    // Add ownerFullName to each store
    const storesWithFullName = stores.map(store => ({
      ...store,
      ownerFullName: store.owner_name
    }));

    res.render('users/Store', { stores: storesWithFullName });
  } catch (error) {
    console.error("Error fetching stores:", error.message);
    res.status(500).send('Server Error');
  }
};

export const addStore = async (req, res) => {
  try {
    const { storeName, ownerFirstName, ownerLastName, contactInfo, location, ownerEmail } = req.body;
    const ownerName = `${ownerFirstName} ${ownerLastName}`;
    // Validate required fields
    if (!storeName || !ownerFirstName || !ownerLastName || !ownerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Store name, owner name, and owner email are required'
      });
    }

    // Check if owner email already exists
    const { data: existingUser, error: userCheckError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_email', ownerEmail)
      .single();

      let ownerId;

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already exists',
        message: 'A user with this email already exists'
      });
    }

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

    // Get the next store_id by finding the max and adding 1
    const { data: maxStore, error: maxError } = await supabase
      .from('stores')
      .select('store_id')
      .order('store_id', { ascending: false })
      .limit(1)
      .single();

    const nextStoreId = maxStore ? maxStore.store_id + 1 : 1;

    // First, create the store to get the store_code
    const { data: newStore, error: storeError } = await supabase.from('stores').insert([{
      store_id: nextStoreId,
      store_name: storeName,
      owner_name: ownerName,
      owner_contact: contactInfo,
      store_image: storeImage,
      location: location || "Unknown",
      is_active: true,
      owner_id: 1  // Temporary placeholder, will be updated after user creation
    }]).select().single();

    if (storeError) throw storeError;

    // Hash the store_code to use as initial password
    const hashedPassword = await bcrypt.hash(newStore.store_code, 10);

    // Create user account with store_code as password
    const { data: newUser, error: userError } = await supabase.from('users').insert([{
      username: ownerEmail,
      user_email: ownerEmail,
      contact_number: contactInfo,
      password: hashedPassword,
      role: 'owner',  // Store owners are vendors
      first_name: ownerFirstName, 
      last_name: ownerLastName
    }]).select().single();

    if (userError) {
      // If user creation fails, delete the store to maintain consistency
      await supabase.from('stores').delete().eq('store_id', newStore.store_id);
      throw userError;
    }

    // Update the store with the correct owner_id
    const { error: updateError } = await supabase
      .from('stores')
      .update({ owner_id: newUser.user_id })
      .eq('store_id', newStore.store_id);

    if (updateError) {
      await supabase.from('users').delete().eq('user_id', newUser.user_id);
      await supabase.from('stores').delete().eq('store_id', newStore.store_id);
      throw updateError;
    }

    console.log("✅ Store and owner account created successfully");
    // Return JSON response with the created store data
    res.json({ 
      success: true, 
      message: 'Store and owner account created successfully',
      store: {
        store_id: newStore.store_id,
        store_name: newStore.store_name,
        store_code: newStore.store_code,
        owner_name: newStore.owner_name,
        owner_contact: newStore.owner_contact,
        location: newStore.location,
        owner_id: newUser.user_id
      },
      owner: {
        user_id: newUser.user_id,
        username: newUser.username,
        user_email: newUser.user_email,
        initial_password: newStore.store_code  // Return the store code as initial password
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
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Missing store ID',
        message: 'Store ID is required for deletion'
      });
    }

    const { error } = await supabase.from('stores').delete().eq("store_id", id);
    if (error) throw error;

    // Return JSON for AJAX
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

// Get all owners (users with role='owner')
export const getOwners = async (req, res) => {
  try {
    const { data: owners, error } = await supabase
      .from('users')
      .select('user_id, username, first_name, last_name, user_email')
      .eq('role', 'owner')
      .order('first_name', { ascending: true });

    if (error) throw error;

    console.log("✅ Fetched owners:", owners.length);
    res.json(owners);
  } catch (error) {
    console.error("❌ Error fetching owners:", error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Server Error',
      message: error.message 
    });
  }
};

// Add store to existing owner
export const addStoreToExistingOwner = async (req, res) => {
  try {
    const { ownerId, storeName, location } = req.body;

    // Validate required fields
    if (!ownerId || !storeName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Owner ID and store name are required'
      });
    }

    // Verify owner exists
    const { data: owner, error: ownerError } = await supabase
      .from('users')
      .select('user_id, first_name, last_name, contact_number')
      .eq('user_id', ownerId)
      .eq('role', 'owner')
      .single();

    if (ownerError || !owner) {
      return res.status(404).json({
        success: false,
        error: 'Owner not found',
        message: 'The selected owner does not exist'
      });
    }

    // Handle store image upload if provided
    let storeImage = null;
    if (req.file) {
      try {
        const file = req.file;
        const filePath = `stores/${Date.now()}_${file.originalname}`;

        console.log('📁 Uploading store image:', file.originalname);

        const { error: uploadError } = await supabase.storage
          .from('store_image')
          .upload(filePath, file.buffer, { contentType: file.mimetype });

        if (uploadError) {
          console.error('❌ Storage upload error:', uploadError);
          throw uploadError;
        }

        const { data: publicURL } = supabase.storage
          .from('store_image')
          .getPublicUrl(filePath);

        storeImage = publicURL.publicUrl;
        console.log('✅ Image uploaded:', storeImage);
      } catch (imageError) {
        console.error('❌ Image processing error:', imageError);
        storeImage = null;
      }
    }

    // Get the next store_id
    const { data: maxStore, error: maxError } = await supabase
      .from('stores')
      .select('store_id')
      .order('store_id', { ascending: false })
      .limit(1)
      .single();

    const nextStoreId = maxStore ? maxStore.store_id + 1 : 1;

    // Create the store
    const { data: newStore, error: storeError } = await supabase
      .from('stores')
      .insert([{
        store_id: nextStoreId,
        owner_id: ownerId,
        store_name: storeName,
        location: location || 'Unknown',
        owner_name: `${owner.first_name} ${owner.last_name}`,
        owner_contact: owner.contact_number,
        store_image: storeImage,
        is_active: true
      }])
      .select()
      .single();

    if (storeError) throw storeError;

    console.log("✅ Store added to existing owner successfully");
    
    res.json({ 
      success: true, 
      message: 'Store added to existing owner successfully',
      store: {
        store_id: newStore.store_id,
        store_name: newStore.store_name,
        store_code: newStore.store_code,
        owner_name: newStore.owner_name,
        owner_contact: newStore.owner_contact,
        location: newStore.location,
        owner_id: newStore.owner_id
      }
    });
  } catch (error) {
    console.error("❌ Error adding store to owner:", error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Server Error',
      message: error.message 
    });
  }
};