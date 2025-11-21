import supabase from '../../config/db.js';
import crypto from 'crypto';

/**
 * Generate a unique promotion code based on store name
 * Format: XXXX123456 (First 4 letters of store name + 6 random digits)
 * Example: RAKS123456 (for Raks Eatery), RAME789012 (for Ramen Shop)
 */
async function generatePromotionCode(storeId) {
  let code;
  let exists = true;
  
  // Get store name
  const { data: storeData } = await supabase
    .from('stores')
    .select('store_name')
    .eq('store_id', storeId)
    .single();
  
  if (!storeData) {
    throw new Error('Store not found');
  }
  
  // Get first 4 letters of store name (uppercase, letters only)
  let storePrefix = storeData.store_name
    .replace(/[^A-Za-z]/g, '') // Remove non-letters
    .substring(0, 4)
    .toUpperCase();
  
  // Pad with 'X' if less than 4 characters
  storePrefix = storePrefix.padEnd(4, 'X');
  
  while (exists) {
    // Generate 6 random digits
    const randomDigits = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0');
    
    code = `${storePrefix}${randomDigits}`;
    
    // Check if code already exists
    const { data } = await supabase
      .from('rewards')
      .select('promotion_code')
      .eq('promotion_code', code)
      .single();
    
    exists = data !== null;
  }
  
  return code;
}

/**
 * Automatically update promotion status based on current date vs start/end dates
 * This runs before fetching promotions to ensure status is current
 */
async function updatePromotionStatuses(storeId = null) {
  const now = new Date();
  
  // Build query to get all rewards
  let query = supabase
    .from('rewards')
    .select('reward_id, start_date, end_date, is_active');
  
  if (storeId) {
    query = query.eq('store_id', storeId);
  }
  
  const { data: rewards, error } = await query;
  
  if (error || !rewards) {
    console.error('Error fetching rewards for status update:', error);
    return;
  }
  
  // Update each reward's status based on dates
  for (const reward of rewards) {
    let shouldBeActive = false;
    
    if (reward.start_date && reward.end_date) {
      const startDate = new Date(reward.start_date);
      const endDate = new Date(reward.end_date);
      
      // Set time boundaries for accurate comparison
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      
      // Active if current date is between start and end dates
      shouldBeActive = now >= startDate && now <= endDate;
    } else {
      // If no dates specified, keep current status
      shouldBeActive = reward.is_active;
    }
    
    // Only update if status needs to change
    if (reward.is_active !== shouldBeActive) {
      await supabase
        .from('rewards')
        .update({ is_active: shouldBeActive })
        .eq('reward_id', reward.reward_id);
      
      console.log(`Updated reward ${reward.reward_id} status to ${shouldBeActive}`);
    }
  }
}

/**
 * Get store_id for the current user
 * Tries direct store_id first, then checks owner relationship
 */
async function getStoreIdForUser(userId) {
  console.log('getStoreIdForUser called with userId:', userId);
  
  // First try to get store_id directly from user
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('store_id, user_id, user_email')
    .eq('user_id', userId)
    .single();
  
  console.log('User query result:', { userData, userError });
  
  if (userData && userData.store_id) {
    console.log('Found store_id directly from user:', userData.store_id);
    return userData.store_id;
  }
  
  // If no direct store_id, try to find store where user is owner
  // Use maybeSingle() to handle multiple stores gracefully
  const { data: storeData, error: storeError } = await supabase
    .from('stores')
    .select('store_id, owner_id, store_name')
    .eq('owner_id', userId)
    .maybeSingle();
  
  console.log('Store query result:', { storeData, storeError });
  
  if (storeData && storeData.store_id) {
    console.log('Found store_id from stores table:', storeData.store_id);
    return storeData.store_id;
  }
  
  // If user has multiple stores, check session for selectedStoreId
  if (storeError && storeError.code === 'PGRST116') {
    console.log('User owns multiple stores, checking session...');
    // This will be handled by the calling function using req.session.selectedStoreId
    return null;
  }
  
  console.error('No store found for user:', userId);
  return null;
}

/**
 * Create a new promotion
 * POST /api/owner/promotions
 */
export const createPromotion = async (req, res) => {
  console.log('POST /api/owner/promotions route hit');
  console.log('Session:', req.session);
  
  try {
    const userId = req.session.userId;
    console.log('User ID from session:', userId);
    
    if (!userId) {
      console.log('No user ID in session, returning 401');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name,
      storeId,
      discountType,
      discountValue,
      discountPercentage,
      selectedProduct,
      buyQuantity,
      getQuantity,
      buyProduct,
      getProduct,
      description,
      points,
      startDate,
      endDate
    } = req.body;

    // Validate required fields
    if (!name || !discountType || !startDate || !endDate || !storeId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify the user owns this store and get store_name
    const { data: store } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('store_id', storeId)
      .eq('owner_id', userId)
      .single();

    if (!store) {
      console.error('Store not found or not owned by user:', userId, storeId);
      return res.status(403).json({ error: 'Access denied to this store' });
    }
    const store_name = store.store_name;
    console.log('Verified store_id:', storeId, 'store_name:', store_name);

    // Prepare promotion data based on discount type
    let finalDiscountValue;
    let finalDescription;
    
    if (discountType === 'discount') {
      finalDiscountValue = discountPercentage || 0;
      finalDescription = `Get ${finalDiscountValue}% off your next purchase`;
    } else if (discountType === 'free') {
      // For free items, use the auto-generated description
      if (!selectedProduct || !description) {
        return res.status(400).json({ error: 'Product selection and description are required for free item promotions' });
      }
      finalDescription = description;
      finalDiscountValue = 0; // No discount value for free items
    } else if (discountType === 'buy_x_get_y') {
      // For Buy X Get Y promotions, validate all required fields
      if (!buyQuantity || !getQuantity || !buyProduct || !getProduct || !description) {
        return res.status(400).json({ error: 'Buy quantity, get quantity, buy product, get product, and description are required for Buy X Get Y promotions' });
      }
      finalDescription = description;
      finalDiscountValue = 0; // No discount value for Buy X Get Y
    } else {
      finalDiscountValue = discountValue || 0;
      finalDescription = `${discountType} promotion - Available from ${startDate} to ${endDate}`;
    }

    // Validate points_required
    const pointsRequired = parseInt(points, 10) || 1; // Default to 1 if 0 or invalid
    if (pointsRequired < 1) {
      return res.status(400).json({ error: 'Points required must be at least 1' });
    }

    // Calculate active state based on current date vs start/end dates
    const now = new Date();
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);
    
    // Set time boundaries for accurate comparison
    startDateTime.setHours(0, 0, 0, 0);
    endDateTime.setHours(23, 59, 59, 999);
    
    // Auto-activate if current date is within the promotion period
    const isActive = now >= startDateTime && now <= endDateTime;

    // Generate unique promotion code based on store
    const promotionCode = await generatePromotionCode(storeId);
    
    console.log('About to insert reward:', {
      store_id: storeId,
      reward_name: name,
      description: finalDescription,
      points_required: pointsRequired,
      promotion_type: discountType,
      promotion_code: promotionCode,
      start_date: startDate,
      end_date: endDate,
      is_active: isActive,
      selected_product: selectedProduct || null,
      buy_quantity: buyQuantity || null,
      get_quantity: getQuantity || null,
      buy_product: buyProduct || null,
      get_product: getProduct || null
    });

    // Insert reward into database with type-specific fields
    const insertData = {
      store_id: storeId,
      reward_name: name,
      description: finalDescription,
      points_required: pointsRequired,
      promotion_code: promotionCode,
      start_date: startDate,
      end_date: endDate,
      is_active: isActive
    };

    // Add type-specific fields
    if (discountType === 'discount') {
      insertData.reward_type = 'Discount';
      insertData.discount_value = finalDiscountValue;
    } else if (discountType === 'free') {
      insertData.reward_type = 'Free Item';
      insertData.free_item_product_id = selectedProduct;
    } else if (discountType === 'buy_x_get_y') {
      insertData.reward_type = 'Buy X Get Y';
      insertData.buy_x_quantity = buyQuantity;
      insertData.buy_x_product_id = buyProduct;
      insertData.get_y_quantity = getQuantity;
      insertData.get_y_product_id = getProduct;
    } else {
      insertData.reward_type = 'generic';
    }

    const { data: reward, error } = await supabase
      .from('rewards')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Detailed error creating reward:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: 'Failed to create promotion: ' + error.message });
    }


    console.log('Promotion created with code:', reward.promotion_code);

    // Notify all users with role 'customer'
    try {
      const { reward_name, points_required } = reward;
      const { data: customers, error: customersError } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'customer');

      if (!customersError && customers && customers.length > 0) {
        const notifications = customers.map(user => ({
          user_id: user.user_id,
          title: 'New Promotion Available!',
          message: `A new promotion "${reward_name}" is now available at ${store_name}! Redeem it for ${points_required} points.`,
          is_read: false,
          created_at: new Date().toISOString()
        }));
        await supabase.from('notifications').insert(notifications);
      }
    } catch (notifyError) {
      console.error('Error sending notifications for new promotion:', notifyError);
    }

    res.status(201).json({ 
      success: true, 
      message: `Promotion created successfully! Promotion Code: ${reward.promotion_code}`,
      promotion: reward,
      promotionCode: reward.promotion_code
    });

  } catch (error) {
    console.error('Detailed error in POST /api/owner/promotions:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
};



/**
 * Get all promotions for the owner's store
 * GET /api/owner/promotions
 */
export const getPromotions = async (req, res) => {
  console.log('GET /api/owner/promotions route hit');
  console.log('Session:', req.session);
  
  try {
    const userId = req.session.userId;
    console.log('User ID from session:', userId);
    
    if (!userId) {
      console.log('No user ID in session, returning 401');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get selectedStoreId from session (null means "All Stores")
    let storeId = req.session.selectedStoreId;
    
    console.log('Selected store_id:', storeId);

    // If no specific store selected, get all stores for this owner
    let storeIds = [];
    if (storeId) {
      storeIds = [storeId];
      // Auto-update promotion statuses before fetching
      await updatePromotionStatuses(storeId);
    } else {
      // Get all stores owned by this user
      const { data: stores } = await supabase
        .from('stores')
        .select('store_id')
        .eq('owner_id', userId);
      
      if (!stores || stores.length === 0) {
        console.error('No stores found for user:', userId);
        return res.status(400).json({ error: 'Store not found. Please contact administrator.' });
      }
      
      storeIds = stores.map(s => s.store_id);
      
      // Update statuses for all stores
      for (const sid of storeIds) {
        await updatePromotionStatuses(sid);
      }
    }

    // Get rewards for the store(s)
    const { data: rewards, error } = await supabase
      .from('rewards')
      .select('*')
      .in('store_id', storeIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Detailed error fetching rewards:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: 'Failed to fetch promotions: ' + error.message });
    }

    // Fetch store names separately
    const { data: stores } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .in('store_id', storeIds);

    // Create a map of store_id to store_name
    const storeMap = {};
    (stores || []).forEach(store => {
      storeMap[store.store_id] = store.store_name;
    });

    // Process promotions to update their active status based on start/end dates
    const now = new Date();
    const processedRewards = (rewards || []).map(reward => {
      if (reward.start_date && reward.end_date) {
        const startDate = new Date(reward.start_date);
        const endDate = new Date(reward.end_date);
        
        // Set time boundaries
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        // Calculate if should be active
        const shouldBeActive = now >= startDate && now <= endDate;
        
        // Update the reward object with calculated active status
        return {
          ...reward,
          store_name: storeMap[reward.store_id],
          is_active: shouldBeActive,
          status: shouldBeActive ? 'active' : (now < startDate ? 'scheduled' : 'expired')
        };
      }
      
      // Fallback for rewards without dates
      return {
        ...reward,
        store_name: storeMap[reward.store_id]
      };
    });

    res.json({ promotions: processedRewards });

  } catch (error) {
    console.error('Detailed error in GET /api/owner/promotions:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
};

/**
 * Get single promotion by ID
 * GET /api/owner/promotions/:id
 */
export const getPromotionById = async (req, res) => {
  console.log('GET /api/owner/promotions/:id route hit');
  
  try {
    const userId = req.session.userId;
    const promotionId = req.params.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    console.log('Fetching promotion:', promotionId, 'for user:', userId);
    
    // Get all stores owned by this user
    const { data: stores } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);
    
    if (!stores || stores.length === 0) {
      console.error('No stores found for user:', userId);
      return res.status(400).json({ error: 'Store not found' });
    }
    
    const storeIds = stores.map(s => s.store_id);
    console.log('User owns store IDs:', storeIds);
    
    // Get the specific promotion (ensure it belongs to one of user's stores)
    const { data: promotion, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('reward_id', promotionId)
      .in('store_id', storeIds) // Ensure user owns this promotion
      .single();
    
    if (error) {
      console.error('Error fetching promotion:', error);
      return res.status(404).json({ error: 'Promotion not found' });
    }
    
    // Process promotion status
    const now = new Date();
    if (promotion.start_date && promotion.end_date) {
      const startDate = new Date(promotion.start_date);
      const endDate = new Date(promotion.end_date);
      
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      
      const shouldBeActive = now >= startDate && now <= endDate;
      
      promotion.is_active = shouldBeActive;
      promotion.status = shouldBeActive ? 'active' : (now < startDate ? 'scheduled' : 'expired');
    }
    
    res.json({ promotion });
    
  } catch (error) {
    console.error('Error in GET /api/owner/promotions/:id:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
};

/**
 * Update promotion
 * PUT /api/owner/promotions/:id
 */
export const updatePromotion = async (req, res) => {
  console.log('PUT /api/owner/promotions/:id route hit');
  
  try {
      // Debug log to inspect incoming payload
      console.log('Update Promotion Payload:', req.body);
      // Normalize legacy frontend field names to canonical DB fields
      const normalized = { ...req.body };

      // Map simple renames
      if (req.body.name !== undefined) normalized.reward_name = req.body.name;
      if (req.body.storeId !== undefined) normalized.store_id = req.body.storeId;
      if (req.body.startDate !== undefined) normalized.start_date = req.body.startDate;
      if (req.body.endDate !== undefined) normalized.end_date = req.body.endDate;
      if (req.body.points_required !== undefined) normalized.points_required = req.body.points_required;
      if (req.body.points !== undefined && normalized.points_required === undefined) normalized.points_required = req.body.points;
      if (req.body.description !== undefined) normalized.description = req.body.description;

      // Map reward type and payloads from legacy naming
      if (req.body.discountType !== undefined) {
        const dt = req.body.discountType;
        if (dt === 'discount') normalized.reward_type = 'Discount';
        else if (dt === 'free') normalized.reward_type = 'Free Item';
        else if (dt === 'buy_x_get_y') normalized.reward_type = 'Buy X Get Y';
        else normalized.reward_type = dt;
      }

      if (req.body.discountValue !== undefined) normalized.discount_value = req.body.discountValue;
      // Prefer explicit discountPercentage when discountValue is empty
      if (req.body.discountPercentage !== undefined && (normalized.discount_value === undefined || normalized.discount_value === '')) normalized.discount_value = req.body.discountPercentage;
      if (req.body.selectedProduct !== undefined && req.body.selectedProduct !== '') normalized.free_item_product_id = req.body.selectedProduct;
      if (req.body.buyQuantity !== undefined && req.body.buyQuantity !== '') normalized.buy_x_quantity = req.body.buyQuantity;
      if (req.body.buyProduct !== undefined && req.body.buyProduct !== '') normalized.buy_x_product_id = req.body.buyProduct;
      if (req.body.getQuantity !== undefined && req.body.getQuantity !== '') normalized.get_y_quantity = req.body.getQuantity;
      if (req.body.getProduct !== undefined && req.body.getProduct !== '') normalized.get_y_product_id = req.body.getProduct;

      console.log('Normalized Update Payload:', normalized);

      // Use normalized object as the source of truth for updates
      const sourceBody = normalized;
      // Normalize numeric types where appropriate
      if (sourceBody.discount_value !== undefined && sourceBody.discount_value !== '') {
        const dv = Number(sourceBody.discount_value);
        if (!Number.isNaN(dv)) sourceBody.discount_value = dv;
      }
      if (sourceBody.buy_x_quantity !== undefined && sourceBody.buy_x_quantity !== '') {
        const bx = parseInt(sourceBody.buy_x_quantity, 10);
        if (!Number.isNaN(bx)) sourceBody.buy_x_quantity = bx;
      }
      if (sourceBody.get_y_quantity !== undefined && sourceBody.get_y_quantity !== '') {
        const gy = parseInt(sourceBody.get_y_quantity, 10);
        if (!Number.isNaN(gy)) sourceBody.get_y_quantity = gy;
      }
      if (sourceBody.points_required !== undefined && sourceBody.points_required !== '') {
        const pr = parseInt(sourceBody.points_required, 10);
        if (!Number.isNaN(pr)) sourceBody.points_required = pr;
      }
    const userId = req.session.userId;
    const promotionId = req.params.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get all stores owned by this user
    const { data: stores } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);
    
    if (!stores || stores.length === 0) {
      return res.status(400).json({ error: 'Store not found' });
    }
    
    const storeIds = stores.map(s => s.store_id);
    
    // Verify ownership (promotion belongs to one of user's stores)
    const { data: existing } = await supabase
      .from('rewards')
      .select('reward_id, store_id')
      .eq('reward_id', promotionId)
      .in('store_id', storeIds)
      .single();
    
    if (!existing) {
      return res.status(404).json({ error: 'Promotion not found or unauthorized' });
    }
    
    const updateData = {};
    // Allow updating all relevant fields including type-specific ones
    const allowedFields = [
      'reward_name', 'description', 'points_required', 'start_date', 'end_date', 'is_active',
      'reward_type', 'discount_value', 'free_item_product_id',
      'buy_x_quantity', 'buy_x_product_id', 'get_y_quantity', 'get_y_product_id'
    ];

    allowedFields.forEach(field => {
      // Skip undefined or empty-string values to avoid DB type errors
      if (sourceBody[field] !== undefined && sourceBody[field] !== '') {
        updateData[field] = sourceBody[field];
      }
    });

    console.log('Final updateData sent to Supabase:', updateData);

    // If reward_type is being changed, null out unrelated type-specific columns
    // so old data from a previous type does not persist.
    if (sourceBody.reward_type) {
      const rt = String(sourceBody.reward_type).toLowerCase();
      if (rt.includes('discount')) {
        // Discount only uses discount_value
        updateData.free_item_product_id = null;
        updateData.buy_x_quantity = null;
        updateData.buy_x_product_id = null;
        updateData.get_y_quantity = null;
        updateData.get_y_product_id = null;
      } else if (rt.includes('free')) {
        // Free item only uses free_item_product_id
        updateData.discount_value = null;
        updateData.buy_x_quantity = null;
        updateData.buy_x_product_id = null;
        updateData.get_y_quantity = null;
        updateData.get_y_product_id = null;
      } else if (rt.includes('buy')) {
        // Buy X Get Y uses buy/get fields
        updateData.discount_value = null;
        updateData.free_item_product_id = null;
      }
    }
    
    const { data: updated, error } = await supabase
      .from('rewards')
      .update(updateData)
      .eq('reward_id', promotionId)
      .select()
      .single();
    
    console.log('Supabase update response:', { updated, error });
    if (error) {
      console.error('Error updating promotion:', error);
      console.error('Attempted update data:', JSON.stringify(updateData, null, 2));
      return res.status(500).json({ error: 'Failed to update promotion' });
    }
    
    res.json({ success: true, promotion: updated });
    
  } catch (error) {
    console.error('Error in PUT /api/owner/promotions/:id:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
};

/**
 * Delete promotion
 * DELETE /api/owner/promotions/:id
 */
export const deletePromotion = async (req, res) => {
  console.log('DELETE /api/owner/promotions/:id route hit');
  
  try {
    const userId = req.session.userId;
    const promotionId = req.params.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Try to get store_id from session first (for multi-store owners), then from database
    const storeId = req.session.selectedStoreId || await getStoreIdForUser(userId);
    
    if (!storeId) {
      return res.status(400).json({ error: 'Store not found' });
    }
    
    // Delete promotion (only if owned by this store)
    const { error } = await supabase
      .from('rewards')
      .delete()
      .eq('reward_id', promotionId)
      .eq('store_id', storeId);
    
    if (error) {
      console.error('Error deleting promotion:', error);
      return res.status(500).json({ error: 'Failed to delete promotion' });
    }
    
    res.json({ success: true, message: 'Promotion deleted successfully' });
    
  } catch (error) {
    console.error('Error in DELETE /api/owner/promotions/:id:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
};
