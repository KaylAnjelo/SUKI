import supabase from "../../config/db.js";
import bcrypt from "bcrypt";
import dns from 'dns/promises';
import EmailService from '../services/emailService.js';

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
      .in('role', ['customer', 'Admin-Created(Customer)'])
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
      .select('user_id, username, contact_number, user_email, role, store_id, first_name, last_name')
    .in('role', ['vendor', 'Admin-Created(Vendor)'])
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

    res.render('users/Vendor', { vendors: vendorsWithStores, stores });
  } catch (error) {
    console.error("Error fetching vendors:", error.message);
    res.status(500).send('Server Error');
  }
};


export const getStores = async (req, res) => {
  try {
    // Fetch all stores
    const { data: stores, error } = await supabase
      .from('stores')
      .select('store_id, owner_id, store_name, is_active, store_code, store_image, location')
      .order('store_id', { ascending: true });

    if (error) throw error;

    // Fetch all owners referenced by stores
    const ownerIds = stores.map(s => s.owner_id).filter(Boolean);
    let owners = [];
    if (ownerIds.length > 0) {
      const { data: ownerData, error: ownerError } = await supabase
        .from('users')
        .select('user_id, first_name, last_name, contact_number, user_email')
        .in('user_id', ownerIds);
      if (ownerError) throw ownerError;
      owners = ownerData || [];
    }

    // Attach owner info to each store
    const storesWithOwnerInfo = stores.map(store => {
      const owner = owners.find(o => o.user_id === store.owner_id);
      return {
        ...store,
        ownerFullName: owner ? `${owner.first_name} ${owner.last_name}` : 'N/A',
        ownerEmail: owner ? owner.user_email : 'N/A',
        ownerContact: owner ? owner.contact_number : 'N/A'
      };
    });

    res.render('users/Store', { stores: storesWithOwnerInfo });
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

export const updateStore = async (req, res) => {
  try {
    // Log incoming request body and file for debugging
    console.log('updateStore called. body:', req.body);
    if (req.file) console.log('updateStore received file:', req.file.originalname, req.file.mimetype, req.file.size);

    const { store_id, store_name, location, owner_contact, store_code } = req.body || {};
    const storeId = store_id ? (isNaN(Number(store_id)) ? store_id : Number(store_id)) : null;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'Missing store_id', message: 'store_id is required' });
    }

    const updates = {};
    if (typeof store_name !== 'undefined' && String(store_name).trim() !== '') updates.store_name = String(store_name).trim();
    if (typeof location !== 'undefined') updates.location = String(location);
    if (typeof owner_contact !== 'undefined') updates.owner_contact = String(owner_contact);
    if (typeof store_code !== 'undefined') updates.store_code = String(store_code);

    // If an image file was uploaded, attempt to store it in Supabase storage
    if (req.file) {
      try {
        const file = req.file;
        const filePath = `stores/${Date.now()}_${file.originalname}`;
        console.log('Uploading updated store image to storage at', filePath);
        const { error: uploadError } = await supabase.storage.from('store_image').upload(filePath, file.buffer, { contentType: file.mimetype });
        if (uploadError) {
          console.error('Storage upload error during update:', uploadError);
        } else {
          const { data: publicURL, error: urlError } = supabase.storage.from('store_image').getPublicUrl(filePath);
          if (!urlError && publicURL && publicURL.publicUrl) {
            updates.store_image = publicURL.publicUrl;
          }
        }
      } catch (imgErr) {
        console.error('Error uploading image during update:', imgErr);
      }
    }

    // Handle explicit image removal flag from client
    // client sends 'remove_image' = '1' to indicate the admin removed the image
    if (req.body && String(req.body.remove_image) === '1') {
      updates.store_image = null;
      console.log('Marked store_image for removal for store:', storeId);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    // Perform update and return the updated row
    const { data: updatedStore, error } = await supabase.from('stores').update(updates).eq('store_id', storeId).select().single();
    if (error) throw error;

    res.json({ success: true, message: 'Store updated successfully', store: updatedStore });
  } catch (error) {
    console.error('Error updating store:', error && error.message ? error.message : error);
    res.status(500).json({ success: false, error: 'Server Error', message: error && error.message ? error.message : String(error) });
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

// Create a customer (admin flow)
export const addCustomer = async (req, res) => {
  try {
    const { username, full_name, user_email, contact_number } = req.body || {};
    if (!user_email) {
      return res.status(400).json({ success: false, error: 'Missing required field: user_email' });
    }
    // If username not provided, use the email as the username
    const finalUsername = (username && String(username).trim()) ? String(username).trim() : String(user_email).trim();

    try {
      const parts = String(user_email).split('@');
      if (parts.length !== 2 || !parts[1]) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }
      const domain = parts[1].toLowerCase();
      // resolve MX records for the domain
      const mx = await dns.resolveMx(domain).catch(() => null);
      if (!mx || mx.length === 0) {
        // If MX lookup fails, warn the admin and reject to avoid creating users with non-deliverable domains
        return res.status(400).json({ success: false, error: 'Email domain appears invalid or has no MX records' });
      }
    } catch (dnsErr) {
      console.warn('MX lookup failed for email:', user_email, dnsErr && dnsErr.message);
      return res.status(400).json({ success: false, error: 'Unable to verify email domain' });
    }

    // Check username uniqueness
    const { data: existingByUsername, error: unameErr } = await supabase
      .from('users')
      .select('user_id')
      .eq('username', finalUsername)
      .maybeSingle();
    if (unameErr) {
      console.error('Error checking username uniqueness:', unameErr);
      return res.status(500).json({ success: false, error: 'Error checking username' });
    }
    if (existingByUsername) {
      return res.status(400).json({ success: false, error: 'Username already exists' });
    }

    // Check email uniqueness
    const { data: existingByEmail, error: emailErr } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_email', user_email)
      .maybeSingle();
    if (emailErr) {
      console.error('Error checking email uniqueness:', emailErr);
      return res.status(500).json({ success: false, error: 'Error checking email' });
    }
    if (existingByEmail) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }

    // split full_name
    let first_name = '';
    let last_name = '';
    if (full_name) {
      const parts = full_name.trim().split(/\s+/);
      first_name = parts.shift() || '';
      last_name = parts.join(' ') || '';
    }

    // Use provided password if present; otherwise use default 'changemeplease'
    const providedPassword = req.body?.password;
    const plainPassword = (providedPassword && String(providedPassword).trim()) ? String(providedPassword) : 'changemeplease';
    const hashed = await bcrypt.hash(plainPassword, 10);

    const insertPayload = {
      username: finalUsername,
      user_email,
      contact_number: contact_number || null,
      password: hashed,
      role: plainPassword === 'changemeplease' ? 'Admin-Created(Customer)' : 'customer',
      first_name,
      last_name,
      must_change_password: plainPassword === 'changemeplease'
    };

    // Try inserting including must_change_password. If the DB schema doesn't have that
    // column (PGRST204), retry without it for compatibility with older schemas.
    let newUser = null;
    try {
      const { data, error: insertErr } = await supabase.from('users').insert([insertPayload]).select('user_id, username, first_name, last_name, user_email, contact_number, role').single();
      if (insertErr) throw insertErr;
      newUser = data;
    } catch (insertErr) {
      console.error('Error inserting new user (first attempt):', insertErr && insertErr.message ? insertErr.message : insertErr);
      const missingMustChange = (insertErr && (insertErr.code === 'PGRST204' || (insertErr.message && insertErr.message.includes('must_change_password'))));
      if (missingMustChange) {
        console.warn('Database appears to be missing `must_change_password` column; retrying insert without it');
        const payloadNoFlag = { ...insertPayload };
        delete payloadNoFlag.must_change_password;
        const { data: data2, error: insertErr2 } = await supabase.from('users').insert([payloadNoFlag]).select('user_id, username, first_name, last_name, user_email, contact_number').single();
        if (insertErr2) {
          console.error('Retry insert without must_change_password failed:', insertErr2);
          return res.status(500).json({ success: false, error: 'Failed to create user', details: insertErr2.message || insertErr2 });
        }
        newUser = data2;
      } else {
        return res.status(500).json({ success: false, error: 'Failed to create user', details: insertErr.message || insertErr });
      }
    }

    // Send email notification to the new customer
    try {
      if (newUser && newUser.user_email) {
        await EmailService.sendAccountCreated(newUser.user_email, {
          name: `${newUser.first_name} ${newUser.last_name}`,
          username: newUser.username,
          role: newUser.role,
        });
      }
    } catch (emailErr) {
      console.warn('Failed to send account creation email to customer:', emailErr && emailErr.message);
    }
    // return created user (do not include password)
    res.status(201).json({ success: true, user: newUser, message: 'Customer created' });
  } catch (err) {
    console.error('Unexpected error in addCustomer:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
};

// Create a vendor (admin flow)
export const addVendor = async (req, res) => {
  try {
    const { username, full_name, user_email, contact_number, store_id } = req.body || {};
    if (!user_email) {
      return res.status(400).json({ success: false, error: 'Missing required field: user_email' });
    }
    if (!store_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: store_id' });
    }

    const finalUsername = (username && String(username).trim()) ? String(username).trim() : String(user_email).trim();

    // Basic email format and MX check (re-use same approach as addCustomer)
    try {
      const parts = String(user_email).split('@');
      if (parts.length !== 2 || !parts[1]) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }
      const domain = parts[1].toLowerCase();
      const mx = await dns.resolveMx(domain).catch(() => null);
      if (!mx || mx.length === 0) {
        return res.status(400).json({ success: false, error: 'Email domain appears invalid or has no MX records' });
      }
    } catch (dnsErr) {
      console.warn('MX lookup failed for email:', user_email, dnsErr && dnsErr.message);
      return res.status(400).json({ success: false, error: 'Unable to verify email domain' });
    }

    // Check username uniqueness
    const { data: existingByUsername, error: unameErr } = await supabase
      .from('users')
      .select('user_id')
      .eq('username', finalUsername)
      .maybeSingle();
    if (unameErr) return res.status(500).json({ success: false, error: 'Error checking username' });
    if (existingByUsername) return res.status(400).json({ success: false, error: 'Username already exists' });

    // Check email uniqueness
    const { data: existingByEmail, error: emailErr } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_email', user_email)
      .maybeSingle();
    if (emailErr) return res.status(500).json({ success: false, error: 'Error checking email' });
    if (existingByEmail) return res.status(400).json({ success: false, error: 'Email already exists' });

    // split full_name
    let first_name = '';
    let last_name = '';
    if (full_name) {
      const parts = full_name.trim().split(/\s+/);
      first_name = parts.shift() || '';
      last_name = parts.join(' ') || '';
    }

    const providedPassword = req.body?.password;
    const plainPassword = (providedPassword && String(providedPassword).trim()) ? String(providedPassword) : 'changemeplease';
    const hashed = await bcrypt.hash(plainPassword, 10);

    const insertPayload = {
      username: finalUsername,
      user_email,
      contact_number: contact_number || null,
      password: hashed,
      role: plainPassword === 'changemeplease' ? 'Admin-Created(Vendor)' : 'vendor',
      first_name,
      last_name,
      store_id: store_id || null,
      must_change_password: plainPassword === 'changemeplease'
    };

    let newUser = null;
    try {
      const { data, error: insertErr } = await supabase.from('users').insert([insertPayload]).select('user_id, username, first_name, last_name, user_email, contact_number, store_id, role').single();
      if (insertErr) throw insertErr;
      newUser = data;
    } catch (insertErr) {
      console.error('Error inserting new vendor (first attempt):', insertErr && insertErr.message ? insertErr.message : insertErr);
      const missingMustChange = (insertErr && (insertErr.code === 'PGRST204' || (insertErr.message && insertErr.message.includes('must_change_password'))));
      if (missingMustChange) {
        const payloadNoFlag = { ...insertPayload };
        delete payloadNoFlag.must_change_password;
        const { data: data2, error: insertErr2 } = await supabase.from('users').insert([payloadNoFlag]).select('user_id, username, first_name, last_name, user_email, contact_number, store_id').single();
        if (insertErr2) {
          console.error('Retry insert without must_change_password failed:', insertErr2);
          return res.status(500).json({ success: false, error: 'Failed to create vendor', details: insertErr2.message || insertErr2 });
        }
        newUser = data2;
      } else {
        return res.status(500).json({ success: false, error: 'Failed to create vendor', details: insertErr.message || insertErr });
      }
    }

    // Attach store_name if possible before returning
    try {
      if (newUser && newUser.store_id) {
        const { data: storeRow, error: storeErr } = await supabase.from('stores').select('store_name').eq('store_id', newUser.store_id).maybeSingle();
        if (!storeErr && storeRow) newUser.store_name = storeRow.store_name;
      }
    } catch (attachErr) {
      console.warn('Could not attach store_name to new vendor response', attachErr && attachErr.message);
    }

    // Send email notification to the new vendor
    try {
      if (newUser && newUser.user_email) {
        await EmailService.sendAccountCreated(newUser.user_email, {
          name: `${newUser.first_name} ${newUser.last_name}`,
          username: newUser.username,
          role: newUser.role,
        });
      }
    } catch (emailErr) {
      console.warn('Failed to send account creation email to vendor:', emailErr && emailErr.message);
    }
    res.status(201).json({ success: true, user: newUser, message: 'Vendor created' });
  } catch (err) {
    console.error('Unexpected error in addVendor:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
};

// Update a user by username
export const updateUser = async (req, res) => {
  try {
    // Accept original identifier either from URL param or from body (body-based route)
    const originalUserId = req.body?.original_user_id;
    const originalUsername = req.params.username || req.body?.original_username;
    if (!originalUserId && !originalUsername) return res.status(400).json({ success: false, error: 'Missing original username or user id' });

    const { username, full_name, user_email, contact_number } = req.body || {};
    if (!username && !full_name && !user_email && !contact_number) {
      return res.status(400).json({ success: false, error: 'No update fields provided' });
    }

    // Split full_name into first and last
    let first_name = null;
    let last_name = null;
    if (full_name) {
      const parts = full_name.trim().split(/\s+/);
      first_name = parts.shift() || '';
      last_name = parts.join(' ') || '';
    }

    const updatePayload = {};
    if (username) updatePayload.username = username;
    if (user_email) updatePayload.user_email = user_email;
    if (contact_number) updatePayload.contact_number = contact_number;
    if (first_name !== null) updatePayload.first_name = first_name;
    if (last_name !== null) updatePayload.last_name = last_name;

    // Perform update by user_id when provided to avoid issues with special characters in username
    let updateQuery = supabase.from('users').update(updatePayload);
    if (originalUserId) {
      const numericId = Number(originalUserId);
      updateQuery = updateQuery.eq('user_id', numericId);
    } else {
      updateQuery = updateQuery.eq('username', originalUsername);
    }
    const { error } = await updateQuery;
    if (error) {
      console.error('Error updating user:', error);
      return res.status(500).json({ success: false, error: 'Failed to update user', details: error.message });
    }

    // Return updated user — prefer lookup by user_id when available
    // Use maybeSingle() to avoid errors when zero or multiple rows are returned
    let lookupQuery = supabase.from('users').select('user_id, username, first_name, last_name, user_email, contact_number');
    if (originalUserId) {
      lookupQuery = lookupQuery.eq('user_id', Number(originalUserId));
    } else {
      const lookupUsername = username || originalUsername;
      lookupQuery = lookupQuery.eq('username', lookupUsername);
    }
    const { data: updatedUser, error: fetchError } = await lookupQuery.maybeSingle();

    if (fetchError) {
      console.warn('Updated but failed to fetch user due to fetchError:', fetchError);
      return res.status(500).json({ success: false, error: 'Failed to fetch updated user', details: fetchError.message || fetchError });
    }

    if (!updatedUser) {
      // Update succeeded but no user matches the lookup (possible if originalUsername changed unexpectedly)
      console.warn('Update applied but no user found for username:', lookupUsername);
      return res.json({ success: true, message: 'User updated but not found by lookupUsername' });
    }

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('Unexpected error in updateUser:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
};

// Delete a user by username
export const deleteUser = async (req, res) => {
  try {
    // Support deletion by user_id (numeric) or username for backward compatibility
    const userIdParam = req.params.id || req.params.username || req.body?.original_user_id;
    if (!userIdParam) return res.status(400).json({ success: false, error: 'Missing username or user id' });

    let query = supabase.from('users').delete();
    // If the param looks like an integer, treat it as user_id
    const numericId = Number(userIdParam);
    if (!Number.isNaN(numericId) && String(numericId) === String(userIdParam)) {
      query = query.eq('user_id', numericId);
    } else {
      query = query.eq('username', userIdParam);
    }

    // Before deleting, fetch the user row so we can archive it
    let lookupQuery = supabase.from('users').select('*');
    if (!Number.isNaN(numericId) && String(numericId) === String(userIdParam)) {
      lookupQuery = lookupQuery.eq('user_id', numericId);
    } else {
      lookupQuery = lookupQuery.eq('username', userIdParam);
    }
    const { data: userRows, error: lookupError } = await lookupQuery;
    if (lookupError) {
      console.error('Error fetching user before delete:', lookupError);
      return res.status(500).json({ success: false, error: 'Failed to lookup user before delete', details: lookupError.message });
    }

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Archive each matched user row into users_dump (add deleted_at)
    const toArchive = userRows.map(u => ({
      ...u,
      deleted_at: new Date().toISOString()
    }));
    const { error: archiveError } = await supabase.from('users_dump').insert(toArchive);
    if (archiveError) {
      console.error('Error archiving user to users_dump:', archiveError);
      // If the users_dump table doesn't have deleted_at, retry without that column for compatibility
      const missingDeletedAt = (archiveError && (archiveError.code === 'PGRST204' || (archiveError.message && archiveError.message.includes('deleted_at'))));
      if (missingDeletedAt) {
        console.warn('users_dump appears to be missing deleted_at column; retrying archive without deleted_at');
        const toArchiveNoDeletedAt = userRows.map(u => {
          const copy = { ...u };
          // remove deleted_at for compatibility
          delete copy.deleted_at;
          return copy;
        });
        const { error: archiveError2 } = await supabase.from('users_dump').insert(toArchiveNoDeletedAt);
        if (archiveError2) {
          console.error('Retry archive without deleted_at failed:', archiveError2);
          return res.status(500).json({ success: false, error: 'Failed to archive user', details: archiveError2.message });
        }
      } else {
        return res.status(500).json({ success: false, error: 'Failed to archive user', details: archiveError.message });
      }
    }

    // Now perform the deletion
    const { error: deleteError } = await query;
    if (deleteError) {
      console.error('Error deleting user after archive:', deleteError);
      return res.status(500).json({ success: false, error: 'Failed to delete user after archiving', details: deleteError.message });
    }

    res.json({ success: true, deleted: userIdParam, message: 'User archived to users_dump and deleted' });
  } catch (err) {
    console.error('Unexpected error in deleteUser:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
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
