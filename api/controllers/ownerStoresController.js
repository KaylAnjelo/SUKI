// Owner Stores Controller
import supabase from '../../config/db.js';
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/*GET all stores for the authenticated owner*/
export const getOwnerStores = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: stores, error } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching owner stores:', error);
      return res.status(500).json({ error: 'Failed to fetch stores' });
    }

    res.json(stores || []);
  } catch (err) {
    console.error('Error in getOwnerStores:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/*GET a specific store by ID (owner's stores only)*/
export const getOwnerStoreById = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: store, error } = await supabase
      .from('stores')
      .select('*')
      .eq('store_id', id)
      .eq('owner_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Store not found or access denied' });
      }
      console.error('Error fetching store:', error);
      return res.status(500).json({ error: 'Failed to fetch store' });
    }

    res.json(store);
  } catch (err) {
    console.error('Error in getOwnerStoreById:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/*CREATE a new store for the authenticated owner*/
export const createOwnerStore = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { storeName, location, ownerName, ownerContact, isActive = true } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!storeName) {
      return res.status(400).json({ error: 'Store name is required' });
    }

    let storeImage = null;
    
    // Handle image upload if provided
    if (req.file) {
      try {
        const file = req.file;
        const filePath = `stores/${Date.now()}_${file.originalname}`;

        console.log('📁 Uploading store image:', file.originalname);
        console.log('📂 Target bucket: store_image');

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

        console.log('✅ Store image uploaded successfully');

        // Get public URL
        const { data: publicURL, error: urlError } = supabase.storage
          .from('store_image')
          .getPublicUrl(filePath);

        if (urlError) {
          console.error('❌ Public URL error:', urlError);
          throw urlError;
        }

        storeImage = publicURL.publicUrl;
        console.log('🔗 Store image URL generated:', storeImage);
      } catch (imageError) {
        console.error('❌ Store image processing error:', imageError);
        // Continue without image if there's an error
        storeImage = null;
        console.log('⚠️ Continuing without image upload');
      }
    }

    const storeData = {
      owner_id: userId,
      store_name: storeName,
      location: location || null,
      owner_name: ownerName || null,
      owner_contact: ownerContact ? parseInt(ownerContact) : null,
      is_active: isActive === 'true' || isActive === true,
      store_image: storeImage
    };

    const { data: store, error } = await supabase
      .from('stores')
      .insert([storeData])
      .select('*')
      .single();

    if (error) {
      console.error('Error creating store:', error);
      return res.status(500).json({ error: 'Failed to create store' });
    }

    res.status(201).json({
      message: 'Store created successfully',
      store: store
    });
  } catch (err) {
    console.error('Error in createOwnerStore:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/*UPDATE a store (owner's stores only)*/
export const updateOwnerStore = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    const { storeName, location, ownerName, ownerContact, isActive } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify store belongs to owner
    const { data: existingStore, error: fetchError } = await supabase
      .from('stores')
      .select('store_id, store_image')
      .eq('store_id', id)
      .eq('owner_id', userId)
      .single();

    if (fetchError || !existingStore) {
      return res.status(404).json({ error: 'Store not found or access denied' });
    }

    let storeImage = existingStore.store_image;
    let shouldUpdateImage = false;
    
    // Handle photo removal
    if (req.body.removePhoto === 'true') {
      storeImage = null;
      shouldUpdateImage = true;
      console.log('🗑️ Removing store photo');
    }
    // Handle new image upload if provided
    else if (req.file) {
      try {
        const file = req.file;
        const filePath = `stores/${Date.now()}_${file.originalname}`;

        console.log('📁 Uploading new store image:', file.originalname);

        // Upload image to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('store_image')
          .upload(filePath, file.buffer, { contentType: file.mimetype });

        if (uploadError) {
          console.error('❌ Storage upload error:', uploadError);
          throw uploadError;
        }

        // Get public URL
        const { data: publicURL, error: urlError } = supabase.storage
          .from('store_image')
          .getPublicUrl(filePath);

        if (urlError) {
          console.error('❌ Public URL error:', urlError);
          throw urlError;
        }

        storeImage = publicURL.publicUrl;
        shouldUpdateImage = true;
        console.log('🔗 New store image URL generated:', storeImage);
      } catch (imageError) {
        console.error('❌ Store image processing error:', imageError);
        // Continue with existing image if there's an error
        console.log('⚠️ Continuing with existing image');
      }
    }

    const updateData = {
      store_name: storeName,
      location: location || null,
      owner_name: ownerName || null,
      owner_contact: ownerContact ? parseInt(ownerContact) : null,
      is_active: isActive === 'true' || isActive === true
    };

    // Only update store_image if it was modified
    if (shouldUpdateImage) {
      updateData.store_image = storeImage;
    }

    const { data: store, error } = await supabase
      .from('stores')
      .update(updateData)
      .eq('store_id', id)
      .eq('owner_id', userId)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating store:', error);
      return res.status(500).json({ error: 'Failed to update store' });
    }

    res.json({
      message: 'Store updated successfully',
      store: store
    });
  } catch (err) {
    console.error('Error in updateOwnerStore:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/*DELETE a store (owner's stores only)*/
export const deleteOwnerStore = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify store belongs to owner
    const { data: existingStore, error: fetchError } = await supabase
      .from('stores')
      .select('store_id')
      .eq('store_id', id)
      .eq('owner_id', userId)
      .single();

    if (fetchError || !existingStore) {
      return res.status(404).json({ error: 'Store not found or access denied' });
    }

    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('store_id', id)
      .eq('owner_id', userId);

    if (error) {
      console.error('Error deleting store:', error);
      return res.status(500).json({ error: 'Failed to delete store' });
    }

    res.json({ message: 'Store deleted successfully' });
  } catch (err) {
    console.error('Error in deleteOwnerStore:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Export multer middleware for use in routes
export { upload };

