import express from "express";
import multer from "multer";
import supabase from "../../config/db.js";

const router = express.Router();

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

// Get all stores owned by the current user
router.get('/stores', async (req, res) => {
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
      console.error('Error fetching stores:', error);
      return res.status(500).json({ error: 'Failed to fetch stores' });
    }

    res.json(stores);
  } catch (error) {
    console.error('Error in GET /api/owner/stores:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific store by ID
router.get('/stores/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const storeId = req.params.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: store, error } = await supabase
      .from('stores')
      .select('*')
      .eq('store_id', storeId)
      .eq('owner_id', userId)
      .single();

    if (error) {
      console.error('Error fetching store:', error);
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json(store);
  } catch (error) {
    console.error('Error in GET /api/owner/stores/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new store
router.post('/stores', upload.single('storeImage'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const { storeName, storeCode, ownerContact, location, isActive } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate required fields
    if (!storeName || !storeCode || !ownerContact || !location) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let storeImage = null;
    
    // Handle image upload if provided
    if (req.file) {
      try {
        const file = req.file;
        const filePath = `stores/${Date.now()}_${file.originalname}`;

        // Upload image to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('store_image')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Error uploading image:', uploadError);
          return res.status(500).json({ error: 'Failed to upload image' });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('store_image')
          .getPublicUrl(filePath);
        
        storeImage = publicUrl;
      } catch (uploadError) {
        console.error('Error processing image upload:', uploadError);
        return res.status(500).json({ error: 'Failed to process image' });
      }
    }

    // Create store record
    const { data: newStore, error: storeError } = await supabase
      .from('stores')
      .insert({
        store_name: storeName,
        store_code: storeCode,
        owner_contact: ownerContact,
        location: location,
        store_image: storeImage,
        is_active: isActive === 'true' || isActive === true,
        owner_id: userId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (storeError) {
      console.error('Error creating store:', storeError);
      return res.status(500).json({ error: 'Failed to create store' });
    }

    res.status(201).json({
      message: 'Store created successfully',
      store: newStore
    });
  } catch (error) {
    console.error('Error in POST /api/owner/stores:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a store
router.put('/stores/:id', upload.single('storeImage'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const storeId = req.params.id;
    const { storeName, storeCode, ownerContact, location, isActive } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if store exists and belongs to user
    const { data: existingStore, error: fetchError } = await supabase
      .from('stores')
      .select('*')
      .eq('store_id', storeId)
      .eq('owner_id', userId)
      .single();

    if (fetchError || !existingStore) {
      return res.status(404).json({ error: 'Store not found' });
    }

    let storeImage = existingStore.store_image;
    
    // Handle image upload if provided
    if (req.file) {
      try {
        const file = req.file;
        const filePath = `stores/${Date.now()}_${file.originalname}`;

        // Upload new image to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('store_image')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Error uploading image:', uploadError);
          return res.status(500).json({ error: 'Failed to upload image' });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('store_image')
          .getPublicUrl(filePath);
        
        storeImage = publicUrl;
      } catch (uploadError) {
        console.error('Error processing image upload:', uploadError);
        return res.status(500).json({ error: 'Failed to process image' });
      }
    }

    // Update store record
    const updateData = {
      store_name: storeName,
      store_code: storeCode,
      owner_contact: ownerContact,
      location: location,
      is_active: isActive === 'true' || isActive === true,
      updated_at: new Date().toISOString()
    };

    if (storeImage) {
      updateData.store_image = storeImage;
    }

    const { data: updatedStore, error: updateError } = await supabase
      .from('stores')
      .update(updateData)
      .eq('store_id', storeId)
      .eq('owner_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating store:', updateError);
      return res.status(500).json({ error: 'Failed to update store' });
    }

    res.json({
      message: 'Store updated successfully',
      store: updatedStore
    });
  } catch (error) {
    console.error('Error in PUT /api/owner/stores/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a store
router.delete('/stores/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const storeId = req.params.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if store exists and belongs to user
    const { data: existingStore, error: fetchError } = await supabase
      .from('stores')
      .select('*')
      .eq('store_id', storeId)
      .eq('owner_id', userId)
      .single();

    if (fetchError || !existingStore) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Delete store
    const { error: deleteError } = await supabase
      .from('stores')
      .delete()
      .eq('store_id', storeId)
      .eq('owner_id', userId);

    if (deleteError) {
      console.error('Error deleting store:', deleteError);
      return res.status(500).json({ error: 'Failed to delete store' });
    }

    res.json({ message: 'Store deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/owner/stores/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stores for dropdown (used in dashboard)
router.get('/stores/dropdown', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: stores, error } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('owner_id', userId)
      .eq('is_active', true)
      .order('store_name', { ascending: true });

    if (error) {
      console.error('Error fetching stores dropdown:', error);
      return res.status(500).json({ error: 'Failed to fetch stores' });
    }

    res.json(stores);
  } catch (error) {
    console.error('Error in GET /api/owner/stores/dropdown:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all redemptions from owner's stores
router.get('/redemptions', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // First get all stores owned by the user
    const { data: userStores, error: storesError } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storesError) {
      console.error('Error fetching user stores:', storesError);
      return res.status(500).json({ error: 'Failed to fetch user stores' });
    }

    if (!userStores || userStores.length === 0) {
      return res.json([]);
    }

    const storeIds = userStores.map(store => store.store_id);

    // Get redemptions from all user's stores
    const { data: redemptions, error: redemptionsError } = await supabase
      .from('redemptions')
      .select(`
        redemption_id,
        customer_id,
        store_id,
        reward_id,
        points_used,
        status,
        redemption_date,
        description,
        created_at,
        stores!inner(store_name, store_id),
        customers!inner(customer_name, points_balance),
        rewards!inner(reward_name, description)
      `)
      .in('store_id', storeIds)
      .order('redemption_date', { ascending: false });

    if (redemptionsError) {
      console.error('Error fetching redemptions:', redemptionsError);
      return res.status(500).json({ error: 'Failed to fetch redemptions' });
    }

    // Transform the data to match the expected format
    const transformedRedemptions = redemptions.map(redemption => ({
      redemption_id: redemption.redemption_id,
      customer_name: redemption.customers?.customer_name || 'Unknown Customer',
      store_name: redemption.stores?.store_name || 'Unknown Store',
      reward_name: redemption.rewards?.reward_name || 'Unknown Reward',
      points_used: redemption.points_used,
      status: redemption.status,
      redemption_date: redemption.redemption_date,
      description: redemption.description || redemption.rewards?.description || 'No description',
      customer_points_balance: redemption.customers?.points_balance || 0,
      store_id: redemption.store_id
    }));

    res.json(transformedRedemptions);
  } catch (error) {
    console.error('Error in GET /api/owner/redemptions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get redemption details by ID
router.get('/redemptions/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const redemptionId = req.params.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // First get all stores owned by the user
    const { data: userStores, error: storesError } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storesError) {
      console.error('Error fetching user stores:', storesError);
      return res.status(500).json({ error: 'Failed to fetch user stores' });
    }

    const storeIds = userStores.map(store => store.store_id);

    // Get specific redemption
    const { data: redemption, error: redemptionError } = await supabase
      .from('redemptions')
      .select(`
        redemption_id,
        customer_id,
        store_id,
        reward_id,
        points_used,
        status,
        redemption_date,
        description,
        created_at,
        stores!inner(store_name, store_id),
        customers!inner(customer_name, points_balance),
        rewards!inner(reward_name, description)
      `)
      .eq('redemption_id', redemptionId)
      .in('store_id', storeIds)
      .single();

    if (redemptionError || !redemption) {
      return res.status(404).json({ error: 'Redemption not found' });
    }

    // Transform the data
    const transformedRedemption = {
      redemption_id: redemption.redemption_id,
      customer_name: redemption.customers?.customer_name || 'Unknown Customer',
      store_name: redemption.stores?.store_name || 'Unknown Store',
      reward_name: redemption.rewards?.reward_name || 'Unknown Reward',
      points_used: redemption.points_used,
      status: redemption.status,
      redemption_date: redemption.redemption_date,
      description: redemption.description || redemption.rewards?.description || 'No description',
      customer_points_balance: redemption.customers?.points_balance || 0,
      store_id: redemption.store_id
    };

    res.json(transformedRedemption);
  } catch (error) {
    console.error('Error in GET /api/owner/redemptions/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Owner dashboard metrics endpoint
router.get('/dashboard-metrics', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's stores count
    const { count: totalStores } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId);

    // Get total customers from owner's stores
    const { count: totalCustomers } = await supabase
      .from('transactions')
      .select('customer_id', { count: 'exact', head: true })
      .in('store_id', 
        supabase
          .from('stores')
          .select('store_id')
          .eq('owner_id', userId)
      );

    // Get total points earned from owner's stores
    const { data: pointsData } = await supabase
      .from('transactions')
      .select('points')
      .in('store_id', 
        supabase
          .from('stores')
          .select('store_id')
          .eq('owner_id', userId)
      );

    const totalPoints = pointsData?.reduce((sum, t) => sum + (t.points || 0), 0) || 0;

    // Get total redemptions from owner's stores
    const { count: totalRedemptions } = await supabase
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .in('store_id', 
        supabase
          .from('stores')
          .select('store_id')
          .eq('owner_id', userId)
      );

    res.json({
      totalStores: totalStores || 0,
      totalCustomers: totalCustomers || 0,
      totalPoints: totalPoints,
      totalRedemptions: totalRedemptions || 0,
      storesGrowth: 5, // Placeholder - implement actual growth calculation
      customersGrowth: 12, // Placeholder
      pointsGrowth: 8, // Placeholder
      redemptionsGrowth: 15 // Placeholder
    });
  } catch (error) {
    console.error('Error in GET /api/owner/dashboard-metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Owner engagement data endpoint
router.get('/engagement', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { storeId, period = 'month' } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's store IDs
    let storeQuery = supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storeId) {
      storeQuery = storeQuery.eq('store_id', storeId);
    }

    const { data: stores } = await storeQuery;
    const storeIds = stores?.map(s => s.store_id) || [];

    if (storeIds.length === 0) {
      return res.json({ labels: [], data: [] });
    }

    // Generate labels based on period
    let labels = [];
    const now = new Date();
    
    if (period === 'week') {
      labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    } else if (period === 'month') {
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    } else if (period === 'year') {
      const currentYear = now.getFullYear();
      labels = Array.from({ length: 5 }, (_, i) => (currentYear - 4 + i).toString());
    }

    // Get transaction data
    const { data: transactions } = await supabase
      .from('transactions')
      .select('points, transaction_date')
      .in('store_id', storeIds)
      .order('transaction_date', { ascending: true });

    // Process data based on period
    const data = new Array(labels.length).fill(0);
    
    if (transactions) {
      transactions.forEach(transaction => {
        const date = new Date(transaction.transaction_date);
        let index = -1;
        
        if (period === 'week') {
          index = date.getDay() - 1; // Monday = 0
        } else if (period === 'month') {
          index = date.getMonth();
        } else if (period === 'year') {
          const year = date.getFullYear();
          index = labels.indexOf(year.toString());
        }
        
        if (index >= 0 && index < data.length) {
          data[index] += transaction.points || 0;
        }
      });
    }

    res.json({ labels, data });
  } catch (error) {
    console.error('Error in GET /api/owner/engagement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Owner store breakdown endpoint
router.get('/store-breakdown', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { store = '' } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's stores
    let storeQuery = supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('owner_id', userId);

    if (store) {
      storeQuery = storeQuery.eq('store_id', store);
    }

    const { data: stores } = await storeQuery;

    if (!stores || stores.length === 0) {
      return res.json({ labels: [], data: [], breakdown: [] });
    }

    // Get points data for each store
    const breakdown = [];
    for (const storeData of stores) {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('points')
        .eq('store_id', storeData.store_id);

      const totalPoints = transactions?.reduce((sum, t) => sum + (t.points || 0), 0) || 0;
      
      breakdown.push({
        store_name: storeData.store_name,
        total_points: totalPoints
      });
    }

    const labels = breakdown.map(item => item.store_name);
    const data = breakdown.map(item => item.total_points);

    res.json({ labels, data, breakdown });
  } catch (error) {
    console.error('Error in GET /api/owner/store-breakdown:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sales Report endpoint
router.get('/sales-report', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { dateFrom, dateTo, storeId, sortBy, page = 1, limit = 10 } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's store IDs
    let storeQuery = supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storeId) {
      storeQuery = storeQuery.eq('store_id', storeId);
    }

    const { data: stores } = await storeQuery;
    const storeIds = stores?.map(s => s.store_id) || [];

    if (storeIds.length === 0) {
      return res.json({
        sales: [],
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: 0
      });
    }

    // Build query for sales data
    let salesQuery = supabase
      .from('transactions')
      .select(`
        transaction_id,
        transaction_date,
        total_amount,
        reference_number,
        store_id,
        stores!inner(store_name, store_id),
        transaction_items!inner(
          product_name,
          quantity,
          unit_price
        )
      `)
      .in('store_id', storeIds);

    // Apply date filters
    if (dateFrom) {
      salesQuery = salesQuery.gte('transaction_date', dateFrom);
    }
    if (dateTo) {
      salesQuery = salesQuery.lte('transaction_date', dateTo);
    }

    // Apply sorting
    switch (sortBy) {
      case 'oldest':
        salesQuery = salesQuery.order('transaction_date', { ascending: true });
        break;
      case 'amount_high':
        salesQuery = salesQuery.order('total_amount', { ascending: false });
        break;
      case 'amount_low':
        salesQuery = salesQuery.order('total_amount', { ascending: true });
        break;
      case 'product':
        salesQuery = salesQuery.order('transaction_items.product_name', { ascending: true });
        break;
      default: // newest
        salesQuery = salesQuery.order('transaction_date', { ascending: false });
    }

    // Get total count for pagination
    const { count: totalCount } = await salesQuery.select('*', { count: 'exact', head: true });

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    salesQuery = salesQuery.range(offset, offset + parseInt(limit) - 1);

    const { data: salesData, error } = await salesQuery;

    if (error) {
      console.error('Error fetching sales data:', error);
      return res.status(500).json({ error: 'Failed to fetch sales data' });
    }

    // Transform the data to match the expected format
    const transformedSales = salesData?.map(transaction => ({
      date: transaction.transaction_date,
      reference: transaction.reference_number || `TXN-${transaction.transaction_id}`,
      product: transaction.transaction_items?.[0]?.product_name || 'Multiple Products',
      amount: parseFloat(transaction.total_amount || 0),
      store_name: transaction.stores?.store_name || 'Unknown Store'
    })) || [];

    const totalPages = Math.ceil((totalCount || 0) / parseInt(limit));

    res.json({
      sales: transformedSales,
      total: totalCount || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: totalPages
    });
  } catch (error) {
    console.error('Error in GET /api/owner/sales-report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sales Report CSV Download endpoint
router.get('/sales-report/csv', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { dateFrom, dateTo, storeId, sortBy } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's store IDs
    let storeQuery = supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storeId) {
      storeQuery = storeQuery.eq('store_id', storeId);
    }

    const { data: stores } = await storeQuery;
    const storeIds = stores?.map(s => s.store_id) || [];

    if (storeIds.length === 0) {
      return res.status(404).json({ error: 'No stores found' });
    }

    // Build query for sales data
    let salesQuery = supabase
      .from('transactions')
      .select(`
        transaction_id,
        transaction_date,
        total_amount,
        reference_number,
        store_id,
        stores!inner(store_name, store_id),
        transaction_items!inner(
          product_name,
          quantity,
          unit_price
        )
      `)
      .in('store_id', storeIds);

    // Apply filters
    if (dateFrom) {
      salesQuery = salesQuery.gte('transaction_date', dateFrom);
    }
    if (dateTo) {
      salesQuery = salesQuery.lte('transaction_date', dateTo);
    }

    // Apply sorting
    switch (sortBy) {
      case 'oldest':
        salesQuery = salesQuery.order('transaction_date', { ascending: true });
        break;
      case 'amount_high':
        salesQuery = salesQuery.order('total_amount', { ascending: false });
        break;
      case 'amount_low':
        salesQuery = salesQuery.order('total_amount', { ascending: true });
        break;
      case 'product':
        salesQuery = salesQuery.order('transaction_items.product_name', { ascending: true });
        break;
      default:
        salesQuery = salesQuery.order('transaction_date', { ascending: false });
    }

    const { data: salesData, error } = await salesQuery;

    if (error) {
      console.error('Error fetching sales data for CSV:', error);
      return res.status(500).json({ error: 'Failed to fetch sales data' });
    }

    // Transform data for CSV
    const csvData = salesData?.map(transaction => ({
      Date: transaction.transaction_date,
      'Reference #': transaction.reference_number || `TXN-${transaction.transaction_id}`,
      'Product Sold': transaction.transaction_items?.[0]?.product_name || 'Multiple Products',
      'Total Amount': parseFloat(transaction.total_amount || 0),
      'Store': transaction.stores?.store_name || 'Unknown Store'
    })) || [];

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.csv"');

    // Generate CSV content
    if (csvData.length === 0) {
      return res.send('Date,Reference #,Product Sold,Total Amount,Store\n');
    }

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');

    res.send(csvContent);
  } catch (error) {
    console.error('Error in GET /api/owner/sales-report/csv:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sales Report PDF Download endpoint
router.get('/sales-report/pdf', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { dateFrom, dateTo, storeId, sortBy } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's store IDs
    let storeQuery = supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('owner_id', userId);

    if (storeId) {
      storeQuery = storeQuery.eq('store_id', storeId);
    }

    const { data: stores } = await storeQuery;
    const storeIds = stores?.map(s => s.store_id) || [];

    if (storeIds.length === 0) {
      return res.status(404).json({ error: 'No stores found' });
    }

    // Build query for sales data
    let salesQuery = supabase
      .from('transactions')
      .select(`
        transaction_id,
        transaction_date,
        total_amount,
        reference_number,
        store_id,
        stores!inner(store_name, store_id),
        transaction_items!inner(
          product_name,
          quantity,
          unit_price
        )
      `)
      .in('store_id', storeIds);

    // Apply filters
    if (dateFrom) {
      salesQuery = salesQuery.gte('transaction_date', dateFrom);
    }
    if (dateTo) {
      salesQuery = salesQuery.lte('transaction_date', dateTo);
    }

    // Apply sorting
    switch (sortBy) {
      case 'oldest':
        salesQuery = salesQuery.order('transaction_date', { ascending: true });
        break;
      case 'amount_high':
        salesQuery = salesQuery.order('total_amount', { ascending: false });
        break;
      case 'amount_low':
        salesQuery = salesQuery.order('total_amount', { ascending: true });
        break;
      case 'product':
        salesQuery = salesQuery.order('transaction_items.product_name', { ascending: true });
        break;
      default:
        salesQuery = salesQuery.order('transaction_date', { ascending: false });
    }

    const { data: salesData, error } = await salesQuery;

    if (error) {
      console.error('Error fetching sales data for PDF:', error);
      return res.status(500).json({ error: 'Failed to fetch sales data' });
    }

    // Transform data for PDF
    const pdfData = salesData?.map(transaction => ({
      date: transaction.transaction_date,
      reference: transaction.reference_number || `TXN-${transaction.transaction_id}`,
      product: transaction.transaction_items?.[0]?.product_name || 'Multiple Products',
      amount: parseFloat(transaction.total_amount || 0),
      store: transaction.stores?.store_name || 'Unknown Store'
    })) || [];

    // Generate PDF
    // Placeholder
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.pdf"');
    
    // actual PDF
    res.json({
      message: 'PDF generation not implemented yet',
      data: pdfData,
      filters: { dateFrom, dateTo, storeId, sortBy },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in GET /api/owner/sales-report/pdf:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile page route
router.get('/profile', (req, res) => {
  console.log('🔍 Owner profile route hit');
  console.log('🔍 Session user:', req.session.user);

  if (!req.session.user || req.session.user.role !== 'owner') {
    console.log('❌ Owner access denied, redirecting to home');
    return res.redirect('/');
  }

  res.render('OwnerSide/Profile', { 
    user: req.session.user
  });
});

export default router;