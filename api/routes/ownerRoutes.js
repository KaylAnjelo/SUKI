import express from "express";
import multer from "multer";
import supabase from "../../config/db.js";
import { generateSalesReportPDF } from "../utils/pdfGenerator.js";

const upload = multer();
const router = express.Router();


// Get all redemptions from owner
router.get('/redemptions', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get redemptions from owner with proper joins
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
        customers!inner(customer_name, points_balance),
        rewards!inner(reward_name, description),
        stores!inner(store_name)
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
      store_name: redemption.stores?.store_name || 'Unknown Store',
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

    // Get specific redemption with proper joins
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
        customers!inner(customer_name, points_balance),
        rewards!inner(reward_name, description),
        stores!inner(store_name)
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
      store_name: redemption.stores?.store_name || 'Unknown Store',
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
    const { dateFrom, dateTo, sortBy, storeId, page = 1, limit = 10 } = req.query;
    
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
    if (storeId) {
      salesQuery = salesQuery.eq('store_id', storeId);
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
    const { dateFrom, dateTo, sortBy, storeId } = req.query;
    
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
    if (storeId) {
      salesQuery = salesQuery.eq('store_id', storeId);
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
    const { dateFrom, dateTo, sortBy, storeId } = req.query;
    
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
    if (storeId) {
      salesQuery = salesQuery.eq('store_id', storeId);
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
    try {
      const pdfBuffer = await generateSalesReportPDF(pdfData, { dateFrom, dateTo, storeId });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="sales-report.pdf"');
      res.send(pdfBuffer);
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
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

// Top products endpoint for Owner Dashboard
router.get('/top-products', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { category = 'all', limit = 5 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch transaction items joined to transactions to filter by owner
    const { data: items, error } = await supabase
      .from('transaction_items')
      .select('product_name, quantity, unit_price, transactions!inner(owner_id, transaction_id)')
      .eq('transactions.owner_id', userId);

    if (error) {
      console.error('Error fetching top products:', error);
      return res.status(500).json({ error: 'Failed to fetch top products' });
    }

    // Aggregate by product_name
    const productMap = new Map();
    (items || []).forEach((it) => {
      const key = it.product_name || 'Unknown Product';
      const existing = productMap.get(key) || { product_name: key, total_quantity: 0, total_revenue: 0, store_name: 'N/A' };
      const qty = Number(it.quantity || 0);
      const price = Number(it.unit_price || 0);
      existing.total_quantity += qty;
      existing.total_revenue += qty * price;
      productMap.set(key, existing);
    });

    // Optional: filter by category if your schema has categories (placeholder - no-op)
    let products = Array.from(productMap.values())
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, Number(limit));

    const labels = products.map(p => p.product_name);
    const data = products.map(p => p.total_quantity);
    const backgroundColors = labels.map((_, i) => {
      const hue = (i * 67) % 360;
      return `hsl(${hue}, 70%, 60%)`;
    });

    return res.json({
      labels,
      data,
      backgroundColors,
      products,
      category
    });
  } catch (err) {
    console.error('Error in GET /api/owner/top-products:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer engagement endpoint for Owner Dashboard
router.get('/customer-engagement', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { period = '30d' } = req.query; // '7d' | '30d' | '90d' | '1y'

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Determine labels and bucket function
    let labels = [];
    const now = new Date();

    function formatDate(d) {
      return d.toISOString().slice(0, 10);
    }

    if (period === '7d' || period === '30d' || period === '90d') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        labels.push(formatDate(d));
      }
    } else if (period === '1y') {
      // Last 12 months labels as YYYY-MM
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        labels.push(label);
      }
    }

    // Fetch owner transactions
    const { data: txns, error } = await supabase
      .from('transactions')
      .select('transaction_id, customer_id, points, transaction_date')
      .eq('owner_id', userId)
      .order('transaction_date', { ascending: true });

    if (error) {
      console.error('Error fetching engagement data:', error);
      return res.status(500).json({ error: 'Failed to fetch engagement data' });
    }

    // Initialize series
    const activeCustomersSeries = new Array(labels.length).fill(0);
    const pointsEarnedSeries = new Array(labels.length).fill(0);
    const totalTransactionsSeries = new Array(labels.length).fill(0);

    // Helper to find label index
    function findIndexByDate(dateStr) {
      if (period === '1y') {
        return labels.indexOf(dateStr.slice(0, 7));
      }
      return labels.indexOf(dateStr.slice(0, 10));
    }

    // Track unique customers per bucket
    const uniqueCustomersPerBucket = labels.map(() => new Set());

    (txns || []).forEach(t => {
      const dateStr = (t.transaction_date instanceof Date)
        ? t.transaction_date.toISOString()
        : new Date(t.transaction_date).toISOString();
      const idx = findIndexByDate(dateStr);
      if (idx === -1) return;
      totalTransactionsSeries[idx] += 1;
      pointsEarnedSeries[idx] += Number(t.points || 0);
      if (t.customer_id != null) {
        uniqueCustomersPerBucket[idx].add(String(t.customer_id));
      }
    });

    for (let i = 0; i < labels.length; i++) {
      activeCustomersSeries[i] = uniqueCustomersPerBucket[i].size;
    }

    const datasets = [
      {
        label: 'Active Customers',
        data: activeCustomersSeries,
        borderColor: '#7c0f0f',
        backgroundColor: 'rgba(124, 15, 15, 0.1)',
        yAxisID: 'y'
      },
      {
        label: 'Points Earned',
        data: pointsEarnedSeries,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        yAxisID: 'y1'
      },
      {
        label: 'Total Transactions',
        data: totalTransactionsSeries,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        yAxisID: 'y'
      }
    ];

    const summary = {
      totalCustomers: new Set((txns || []).map(t => t.customer_id)).size,
      totalPoints: (txns || []).reduce((s, t) => s + Number(t.points || 0), 0),
      totalTransactions: (txns || []).length,
      avgPointsPerTransaction: ((txns || []).length ? ((txns || []).reduce((s, t) => s + Number(t.points || 0), 0) / (txns || []).length) : 0)
    };

    return res.json({ labels, datasets, period, summary });
  } catch (err) {
    console.error('Error in GET /api/owner/customer-engagement:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Recommendations endpoint for Owner Dashboard
router.get('/recommendations', async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch recent transactions as a proxy for data sufficiency
    const { data: txns, error } = await supabase
      .from('transactions')
      .select('transaction_id, points, transaction_date')
      .eq('owner_id', userId)
      .order('transaction_date', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error fetching transactions for recommendations:', error);
      return res.status(500).json({ error: 'Failed to fetch recommendations' });
    }

    if (!txns || txns.length < 20) {
      return res.json({ recommendations: [] });
    }

    // Simple heuristic-based recommendations (placeholder)
    const totalPoints = txns.reduce((s, t) => s + Number(t.points || 0), 0);

    const recommendations = [
      {
        title: 'Launch double points on slow days',
        description: 'Points activity is lower mid-week. Offer 2x points on Wednesdays to boost traffic.',
        action: 'Schedule mid-week 2x points promo for the next 4 weeks.',
        type: 'promotional_strategy',
        priority: 'medium'
      },
      {
        title: 'Encourage higher basket size',
        description: 'Average points per transaction suggests room to increase basket size with bundles.',
        action: 'Create bundle offers that award bonus points above a ₱500 spend.',
        type: 'product_optimization',
        priority: 'low',
        revenue: Math.max(0, totalPoints * 1.5)
      }
    ];

    return res.json({ recommendations });
  } catch (err) {
    console.error('Error in GET /api/owner/recommendations:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Stores dropdown for Sales Report filter
router.get('/stores/dropdown', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json([]);
    }

    const { data: stores, error } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('owner_id', userId)
      .order('store_name', { ascending: true });

    if (error) {
      console.error('Error fetching stores for dropdown:', error);
      return res.status(500).json([]);
    }

    res.json(stores || []);
  } catch (err) {
    console.error('Error in GET /api/owner/stores/dropdown:', err);
    res.status(500).json([]);
  }
});

export default router;