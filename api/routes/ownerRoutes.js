import express from "express";
import multer from "multer";
import supabase from "../../config/db.js";

const upload = multer();
const router = express.Router();


// Get all redemptions from owner
router.get('/redemptions', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get redemptions from owner
    const { data: redemptions, error: redemptionsError } = await supabase
      .from('redemptions')
      .select(`
        redemption_id,
        customer_id,
        reward_id,
        points_used,
        status,
        redemption_date,
        description,
        created_at,
        customers!inner(customer_name, points_balance),
        rewards!inner(reward_name, description)
      `)
      .eq('owner_id', userId)
      .order('redemption_date', { ascending: false });

    if (redemptionsError) {
      console.error('Error fetching redemptions:', redemptionsError);
      return res.status(500).json({ error: 'Failed to fetch redemptions' });
    }

    // Transform the data to match the expected format
    const transformedRedemptions = redemptions.map(redemption => ({
      redemption_id: redemption.redemption_id,
      customer_name: redemption.customers?.customer_name || 'Unknown Customer',
      reward_name: redemption.rewards?.reward_name || 'Unknown Reward',
      points_used: redemption.points_used,
      status: redemption.status,
      redemption_date: redemption.redemption_date,
      description: redemption.description || redemption.rewards?.description || 'No description',
      customer_points_balance: redemption.customers?.points_balance || 0
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

    // Get specific redemption
    const { data: redemption, error: redemptionError } = await supabase
      .from('redemptions')
      .select(`
        redemption_id,
        customer_id,
        reward_id,
        points_used,
        status,
        redemption_date,
        description,
        created_at,
        customers!inner(customer_name, points_balance),
        rewards!inner(reward_name, description)
      `)
      .eq('redemption_id', redemptionId)
      .eq('owner_id', userId)
      .single();

    if (redemptionError || !redemption) {
      return res.status(404).json({ error: 'Redemption not found' });
    }

    // Transform the data
    const transformedRedemption = {
      redemption_id: redemption.redemption_id,
      customer_name: redemption.customers?.customer_name || 'Unknown Customer',
      reward_name: redemption.rewards?.reward_name || 'Unknown Reward',
      points_used: redemption.points_used,
      status: redemption.status,
      redemption_date: redemption.redemption_date,
      description: redemption.description || redemption.rewards?.description || 'No description',
      customer_points_balance: redemption.customers?.points_balance || 0
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

    // Get total customers from owner's transactions
    const { count: totalCustomers } = await supabase
      .from('transactions')
      .select('customer_id', { count: 'exact', head: true })
      .eq('owner_id', userId);

    // Get total points earned from owner's transactions
    const { data: pointsData } = await supabase
      .from('transactions')
      .select('points')
      .eq('owner_id', userId);

    const totalPoints = pointsData?.reduce((sum, t) => sum + (t.points || 0), 0) || 0;

    // Get total redemptions from owner
    const { count: totalRedemptions } = await supabase
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId);

    res.json({
      totalStores: 0, // No longer tracking stores
      totalCustomers: totalCustomers || 0,
      totalPoints: totalPoints,
      totalRedemptions: totalRedemptions || 0,
      storesGrowth: 0, // No longer tracking stores
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
    const { period = 'month' } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
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

    // Get transaction data for the owner
    const { data: transactions } = await supabase
      .from('transactions')
      .select('points, transaction_date')
      .eq('owner_id', userId)
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


// Sales Report endpoint
router.get('/sales-report', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { dateFrom, dateTo, sortBy, page = 1, limit = 10 } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Build query for sales data
    let salesQuery = supabase
      .from('transactions')
      .select(`
        transaction_id,
        transaction_date,
        total_amount,
        reference_number,
        transaction_items!inner(
          product_name,
          quantity,
          unit_price
        )
      `)
      .eq('owner_id', userId);

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
      amount: parseFloat(transaction.total_amount || 0)
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
    const { dateFrom, dateTo, sortBy } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Build query for sales data
    let salesQuery = supabase
      .from('transactions')
      .select(`
        transaction_id,
        transaction_date,
        total_amount,
        reference_number,
        transaction_items!inner(
          product_name,
          quantity,
          unit_price
        )
      `)
      .eq('owner_id', userId);

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
      'Total Amount': parseFloat(transaction.total_amount || 0)
    })) || [];

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.csv"');

    // Generate CSV content
    if (csvData.length === 0) {
      return res.send('Date,Reference #,Product Sold,Total Amount\n');
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
    const { dateFrom, dateTo, sortBy } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Build query for sales data
    let salesQuery = supabase
      .from('transactions')
      .select(`
        transaction_id,
        transaction_date,
        total_amount,
        reference_number,
        transaction_items!inner(
          product_name,
          quantity,
          unit_price
        )
      `)
      .eq('owner_id', userId);

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
      amount: parseFloat(transaction.total_amount || 0)
    })) || [];

    // Generate PDF
    // Placeholder
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.pdf"');
    
    // actual PDF
    res.json({
      message: 'PDF generation not implemented yet',
      data: pdfData,
      filters: { dateFrom, dateTo, sortBy },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in GET /api/owner/sales-report/pdf:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Products API routes
router.get('/products', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get products for the owner
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }

    res.json(products || []);
  } catch (error) {
    console.error('Error in GET /api/owner/products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Promotions API routes
router.get('/promotions', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get promotions for the owner
    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching promotions:', error);
      return res.status(500).json({ error: 'Failed to fetch promotions' });
    }

    res.json(promotions || []);
  } catch (error) {
    console.error('Error in GET /api/owner/promotions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile page route
router.get('/profile', async (req, res) => {
  console.log('🔍 Owner profile route hit');
  console.log('🔍 Session user:', req.session.user);

  if (!req.session.user || req.session.user.role !== 'owner') {
    console.log('❌ Owner access denied, redirecting to home');
    return res.redirect('/');
  }

  try {
    const userId = req.session.userId;
    
    // Get owner's store information
    const { data: storeData, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .single();

    if (storeError) {
      console.error('Error fetching store data:', storeError);
      // Continue with just user data if store not found
    }

    // Get user information
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return res.status(500).render('OwnerSide/Profile', { 
        user: req.session.user,
        error: 'Failed to fetch profile data'
      });
    }

    res.render('OwnerSide/Profile', { 
      user: req.session.user,
      storeData: storeData || null,
      userData: userData || null
    });
  } catch (error) {
    console.error('Error in profile route:', error);
    res.render('OwnerSide/Profile', { 
      user: req.session.user,
      error: 'Failed to load profile data'
    });
  }
});

// Get owner profile data API endpoint
router.get('/profile-data', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get owner's store information
    const { data: storeData, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .single();

    if (storeError) {
      console.error('Error fetching store data:', storeError);
    }

    // Get user information
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return res.status(500).json({ error: 'Failed to fetch profile data' });
    }

    res.json({
      user: userData,
      store: storeData
    });
  } catch (error) {
    console.error('Error in profile-data route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update owner profile data API endpoint
router.put('/profile', upload.single('storePhoto'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const { storeName, ownerName, contactNumber, email, location } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let storeImage = null;
    
    // Handle photo upload if provided
    if (req.file) {
      try {
        const file = req.file;
        const filePath = `stores/${Date.now()}_${file.originalname}`;

        console.log('📁 Uploading store photo:', file.originalname);
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

        console.log('✅ Store photo uploaded successfully');

        // Get public URL
        const { data: publicURL, error: urlError } = supabase.storage
          .from('store_image')
          .getPublicUrl(filePath);

        if (urlError) {
          console.error('❌ Public URL error:', urlError);
          throw urlError;
        }

        storeImage = publicURL.publicUrl;
        console.log('🔗 Store photo URL generated:', storeImage);
      } catch (imageError) {
        console.error('❌ Store photo processing error:', imageError);
        // Continue without image if there's an error
        storeImage = null;
        console.log('⚠️ Continuing without photo upload');
      }
    }

    // Update user information
    const { error: userError } = await supabase
      .from('users')
      .update({
        contact_number: contactNumber,
        user_email: email
      })
      .eq('user_id', userId);

    if (userError) {
      console.error('Error updating user data:', userError);
      return res.status(500).json({ error: 'Failed to update user data' });
    }

    // Prepare store update data
    const storeUpdateData = {
      store_name: storeName,
      owner_name: ownerName,
      owner_contact: contactNumber,
      location: location
    };

    // Only update store_image if a new photo was uploaded
    if (storeImage) {
      storeUpdateData.store_image = storeImage;
    }

    // Update store information
    const { error: storeError } = await supabase
      .from('stores')
      .update(storeUpdateData)
      .eq('owner_id', userId);

    if (storeError) {
      console.error('Error updating store data:', storeError);
      return res.status(500).json({ error: 'Failed to update store data' });
    }

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      storeImage: storeImage // Return the new image URL if uploaded
    });
  } catch (error) {
    console.error('Error in profile update route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;