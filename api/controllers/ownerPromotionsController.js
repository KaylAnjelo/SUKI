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
 * Get store_id for the current user
 * Tries direct store_id first, then checks owner relationship
 */
async function getStoreIdForUser(userId) {
  // First try to get store_id directly from user
  const { data: userData } = await supabase
    .from('users')
    .select('store_id')
    .eq('user_id', userId)
    .single();
  
  if (userData && userData.store_id) {
    return userData.store_id;
  }
  
  // If no direct store_id, try to find store where user is owner
  const { data: storeData } = await supabase
    .from('stores')
    .select('store_id')
    .eq('owner_id', userId)
    .single();
  
  if (storeData && storeData.store_id) {
    return storeData.store_id;
  }
  
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
    if (!name || !discountType || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const storeId = await getStoreIdForUser(userId);

    if (!storeId) {
      console.error('No store found for user:', userId);
      return res.status(400).json({ error: 'Store not found. Please contact administrator.' });
    }
    
    console.log('Found store_id:', storeId);

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
    
    // Set time to start of day for start date and end of day for end date
    startDateTime.setHours(0, 0, 0, 0);
    endDateTime.setHours(23, 59, 59, 999);
    
    const isCurrentlyActive = now >= startDateTime && now <= endDateTime;

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
      is_active: isCurrentlyActive,
      selected_product: selectedProduct || null,
      buy_quantity: buyQuantity || null,
      get_quantity: getQuantity || null,
      buy_product: buyProduct || null,
      get_product: getProduct || null
    });

    // Insert reward into database
    const { data: reward, error } = await supabase
      .from('rewards')
      .insert([
        {
          store_id: storeId,
          reward_name: name,
          description: finalDescription,
          points_required: pointsRequired,
          promotion_code: promotionCode,
          start_date: startDate,
          end_date: endDate,
          is_active: isCurrentlyActive
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Detailed error creating reward:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: 'Failed to create promotion: ' + error.message });
    }

    console.log('Promotion created with code:', reward.promotion_code);

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

    const storeId = await getStoreIdForUser(userId);

    if (!storeId) {
      console.error('No store found for user:', userId);
      return res.status(400).json({ error: 'Store not found. Please contact administrator.' });
    }
    
    console.log('Found store_id:', storeId);

    // Get rewards for the store
    const { data: rewards, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Detailed error fetching rewards:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: 'Failed to fetch promotions: ' + error.message });
    }

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
          is_active: shouldBeActive,
          status: shouldBeActive ? 'active' : (now < startDate ? 'scheduled' : 'expired')
        };
      }
      
      // Fallback for rewards without dates
      return reward;
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
    
    const storeId = await getStoreIdForUser(userId);
    
    if (!storeId) {
      console.error('No store found for user:', userId);
      return res.status(400).json({ error: 'Store not found' });
    }
    
    console.log('Found store_id:', storeId);
    
    // Get the specific promotion
    const { data: promotion, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('reward_id', promotionId)
      .eq('store_id', storeId) // Ensure user owns this promotion
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
    const userId = req.session.userId;
    const promotionId = req.params.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const storeId = await getStoreIdForUser(userId);
    
    if (!storeId) {
      return res.status(400).json({ error: 'Store not found' });
    }
    
    // Verify ownership
    const { data: existing } = await supabase
      .from('rewards')
      .select('reward_id')
      .eq('reward_id', promotionId)
      .eq('store_id', storeId)
      .single();
    
    if (!existing) {
      return res.status(404).json({ error: 'Promotion not found or unauthorized' });
    }
    
    const updateData = {};
    const allowedFields = ['reward_name', 'description', 'points_required', 'start_date', 'end_date', 'is_active'];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });
    
    const { data: updated, error } = await supabase
      .from('rewards')
      .update(updateData)
      .eq('reward_id', promotionId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating promotion:', error);
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
    
    const storeId = await getStoreIdForUser(userId);
    
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
