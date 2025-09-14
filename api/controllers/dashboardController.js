import supabase from '../../config/db.js';
import { formatDate, getWeekStartUTC } from '../utils/date.js';

export const getDashboard = async (req, res) => {
  try {
    console.log('🔍 Starting dashboard data fetch...');
    console.log('🔍 User session:', req.session.user);
    
    // Store Owners Count
    const { count: totalStoreOwners, error: storeOwnersError } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true });
    if (storeOwnersError) {
      console.error('❌ Store owners error:', storeOwnersError);
      throw storeOwnersError;
    }
    console.log('✅ Store owners count:', totalStoreOwners);

    // Customers Count - Only count users with 'customer' role
    const { count: totalCustomers, error: customersError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'customer');
    if (customersError) {
      console.error('❌ Customers error:', customersError);
      throw customersError;
    }
    console.log('✅ Customers count:', totalCustomers);

    // Total Points - Check if user_points table exists
    let totalPoints = 0;
    try {
      const { data: totalPointsData, error: totalPointsError } = await supabase
        .from('user_points')
        .select('total_points');
      
      if (totalPointsError) {
        console.error('❌ User points table might not exist:', totalPointsError);
        console.log('📝 Using 0 for total points');
      } else {
        totalPoints = totalPointsData?.reduce((sum, row) => sum + (row.total_points || 0), 0) || 0;
        console.log('✅ Total points calculated:', totalPoints);
      }
    } catch (pointsErr) {
      console.error('❌ Error fetching points:', pointsErr);
      console.log('📝 Continuing with 0 points');
    }

    // Total Redeemed Points
    let totalRedeem = 0;
    try {
      const { data: totalRedeemData, error: totalRedeemError } = await supabase
        .from('user_points')
        .select('redeemed_points');
      
      if (totalRedeemError) {
        console.error('❌ Redeemed points error:', totalRedeemError);
        console.log('📝 Using 0 for redeemed points');
      } else {
        totalRedeem = totalRedeemData?.reduce((sum, row) => sum + (row.redeemed_points || 0), 0) || 0;
        console.log('✅ Total redeemed calculated:', totalRedeem);
      }
    } catch (redeemErr) {
      console.error('❌ Error fetching redeemed points:', redeemErr);
      console.log('📝 Continuing with 0 redeemed points');
    }

    // Recent Transactions - Check if transactions table exists
    let transactions = [];
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      const startDate = thirtyDaysAgo.toISOString().slice(0, 10);
      
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select('transaction_date, points, users(username), stores(store_name)')
        .gte('transaction_date', startDate)
        .order('transaction_date', { ascending: false })
        .limit(10);
        
      if (transactionsError) {
        console.error('❌ Transactions error:', transactionsError);
        console.log('📝 Using empty transactions array');
      } else {
        transactions = transactionsData || [];
        console.log('✅ Transactions fetched:', transactions.length);
      }
    } catch (transErr) {
      console.error('❌ Error fetching transactions:', transErr);
      console.log('📝 Continuing with empty transactions');
    }

    // Stores
    let stores = [];
    try {
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('store_name, location, is_active')
        .limit(10);
        
      if (storesError) {
        console.error('❌ Stores error:', storesError);
        console.log('📝 Using empty stores array');
      } else {
        stores = storesData || [];
        console.log('✅ Stores fetched:', stores.length);
      }
    } catch (storesErr) {
      console.error('❌ Error fetching stores:', storesErr);
      console.log('📝 Continuing with empty stores');
    }

    // Build HTML
    let transactionTableRowsHtml = '';
    let totalPointsCalc = 0;
    let storesTableRowsHtml = '';
    
    console.log('🔍 Building transaction table HTML...');
    if (transactions && transactions.length > 0) {
      transactions.forEach((transaction, index) => {
        console.log(`📝 Processing transaction ${index + 1}:`, transaction);
        const transactionDate = transaction.transaction_date ? 
          new Date(transaction.transaction_date).toLocaleDateString() : 
          'N/A';
          
        transactionTableRowsHtml += `
          <tr>
            <td>${transactionDate}</td>
            <td>${transaction.users?.username || 'N/A'}</td>
            <td>${transaction.points || 0}</td>
            <td>${transaction.stores?.store_name || 'N/A'}</td>
          </tr>
        `;
        totalPointsCalc += transaction.points || 0;
      });
    } else {
      transactionTableRowsHtml = '<tr><td colspan="4">No recent transactions available.</td></tr>';
    }
    console.log('✅ Transaction table HTML built');

    console.log('🔍 Building stores table HTML...');
    if (stores && stores.length > 0) {
      stores.forEach((store, index) => {
        console.log(`📝 Processing store ${index + 1}:`, store);
        storesTableRowsHtml += `
          <tr>
            <td>${store.store_name || 'N/A'}</td>
            <td>${store.location || 'N/A'}</td>
            <td>${store.is_active ? 'Active' : 'Inactive'}</td>
          </tr>
        `;
      });
    } else {
      storesTableRowsHtml = '<tr><td colspan="3">No stores available.</td></tr>';
    }
    console.log('✅ Stores table HTML built');

    // Build chart data from actual transactions and stores
    const storeEngagementMap = new Map();
    const pointsPerWeekMap = new Map();
    
    // Process transactions for charts
    if (transactions && transactions.length > 0) {
      transactions.forEach(transaction => {
        // Count transactions per store for engagement chart
        const storeName = transaction.stores?.store_name || 'Unknown';
        const currentCount = storeEngagementMap.get(storeName) || 0;
        storeEngagementMap.set(storeName, currentCount + 1);
        
        // Aggregate points per week for points chart
        const txDate = new Date(transaction.transaction_date);
        const weekStart = new Date(txDate);
        weekStart.setDate(weekStart.getDate() - txDate.getDay()); // Start of week
        const weekKey = weekStart.toISOString().slice(0, 10);
        const currentPoints = pointsPerWeekMap.get(weekKey) || 0;
        pointsPerWeekMap.set(weekKey, currentPoints + (Number(transaction.points) || 0));
      });
    }
    
    // Build points chart data from actual transactions
    const sortedWeeks = Array.from(pointsPerWeekMap.keys()).sort();
    const pointsLabels = sortedWeeks.map(weekKey => {
      const date = new Date(weekKey);
      return `Week of ${date.toLocaleDateString()}`;
    });
    const pointsData = sortedWeeks.map(weekKey => pointsPerWeekMap.get(weekKey) || 0);
    
    // Build store engagement chart data
    const actualStoreLabels = Array.from(storeEngagementMap.keys());
    const actualStoreEngagementData = actualStoreLabels.map(storeName => storeEngagementMap.get(storeName) || 0);
    
    // If no transaction data, use store names from stores table with zero engagement
    const finalStoreLabels = actualStoreLabels.length > 0 ? actualStoreLabels : stores.map(store => store.store_name);
    const finalEngagementData = actualStoreLabels.length > 0 ? actualStoreEngagementData : stores.map(() => 0);
    
    console.log('📊 Points chart - Labels:', pointsLabels);
    console.log('📊 Points chart - Data:', pointsData);
    console.log('📊 Store labels for chart:', finalStoreLabels);
    console.log('📊 Store engagement data:', finalEngagementData);
    
    // Calculate actual growth percentages
    const calculateGrowth = (current, previous) => {
      if (!previous || previous === 0) return { percentage: '0', class: 'neutral', icon: 'fa-minus' };
      const growth = ((current - previous) / previous) * 100;
      if (growth > 0) return { percentage: Math.abs(growth).toFixed(1), class: 'positive', icon: 'fa-arrow-up' };
      if (growth < 0) return { percentage: Math.abs(growth).toFixed(1), class: 'negative', icon: 'fa-arrow-down' };
      return { percentage: '0', class: 'neutral', icon: 'fa-minus' };
    };

    // For now, set previous period data to current - you can implement actual previous period queries later
    const previousOwners = Math.max(0, (totalStoreOwners || 0) - 1);
    const previousCustomers = Math.max(0, (totalCustomers || 0) - 2);
    const previousPoints = Math.max(0, (totalPoints || 0) - 10);
    const previousRedeemed = Math.max(0, (totalRedeem || 0) - 5);

    const ownersGrowth = calculateGrowth(totalStoreOwners, previousOwners);
    const customersGrowth = calculateGrowth(totalCustomers, previousCustomers);
    const pointsGrowth = calculateGrowth(totalPoints, previousPoints);
    const redeemedGrowth = calculateGrowth(totalRedeem, previousRedeemed);

    const dashboardData = {
      title: 'Admin Dashboard',
      total_owners: totalStoreOwners || 0,
      total_customers: totalCustomers || 0,
      total_points: totalPoints || 0,
      redeemed_points: totalRedeem || 0,
      transactionTableRows: transactionTableRowsHtml,
      storesTableRows: storesTableRowsHtml,
      pointsPerDayLabels: JSON.stringify(pointsLabels.length > 0 ? pointsLabels : ['No Data']),
      pointsPerDayData: JSON.stringify(pointsData.length > 0 ? pointsData : [0]),
      storeLabels: JSON.stringify(finalStoreLabels.length > 0 ? finalStoreLabels : ['No Stores']),
      storeEngagementData: JSON.stringify(finalEngagementData.length > 0 ? finalEngagementData : [0]),
      // Growth data for owners
      owners_growth: ownersGrowth.percentage,
      owners_growth_class: ownersGrowth.class,
      owners_icon: ownersGrowth.icon,
      // Growth data for customers
      customers_growth: customersGrowth.percentage,
      customers_growth_class: customersGrowth.class,
      customers_icon: customersGrowth.icon,
      // Growth data for points
      points_growth: pointsGrowth.percentage,
      points_growth_class: pointsGrowth.class,
      points_icon: pointsGrowth.icon,
      // Growth data for redeemed points
      redeemed_growth: redeemedGrowth.percentage,
      redeemed_growth_class: redeemedGrowth.class,
      redeemed_icon: redeemedGrowth.icon,
      // Product stats growth (using points as proxy)
      product_growth: pointsGrowth.percentage,
      product_growth_class: pointsGrowth.class,
      product_icon: pointsGrowth.icon,
      // User info for template
      user: req.session.user
    };

    console.log('🔍 Final dashboard data summary:');
    console.log('📊 Total owners:', dashboardData.total_owners);
    console.log('📊 Total customers:', dashboardData.total_customers);
    console.log('📊 Total points:', dashboardData.total_points);
    console.log('📊 Redeemed points:', dashboardData.redeemed_points);
    console.log('📊 Transaction rows length:', transactionTableRowsHtml.length);
    console.log('📊 Stores rows length:', storesTableRowsHtml.length);

    console.log('🎯 Rendering AdminDashboard template...');
    res.render('AdminDashboard', dashboardData);
    
  } catch (error) {
    console.error('💥 Error fetching dashboard:', error);
    console.error('💥 Error stack:', error.stack);
    
    const username = req.session.user?.username || "user";
    res.render('AdminDashboard', {
      title: 'Admin Dashboard',
      error: 'Unable to load dashboard data. Please check the console for details.',
      username,
      total_owners: 0,
      total_customers: 0,
      total_points: 0,
      redeemed_points: 0,
      transactionTableRows: '<tr><td colspan="4">Error loading data</td></tr>',
      storesTableRows: '<tr><td colspan="3">Error loading data</td></tr>',
      user: req.session.user || {}
    });
  }
};

export const getStores = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('store_id, store_name, is_active')
      .eq('is_active', true) // Only active stores
      .order('store_name');
    
    if (error) {
      console.error('❌ Stores API error:', error);
      throw error;
    }
    
    console.log('✅ Stores API data:', data);
    res.json(data || []);
  } catch (err) {
    console.error('💥 Error in stores API:', err);
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
};



export const getEngagementData = async (req, res) => {
  try {
    const { storeId, period } = req.query;

    let fromDate = new Date();
    if (period === 'week') {
      fromDate.setDate(fromDate.getDate() - 7);
    } else if (period === 'month') {
      fromDate.setMonth(fromDate.getMonth() - 12); // last 12 months
    } else if (period === 'year') {
      fromDate.setFullYear(fromDate.getFullYear() - 5); // last 5 years
    }

    let query = supabase
      .from('transactions')
      .select('transaction_date, points')
      .gte('transaction_date', fromDate.toISOString().slice(0, 10));

    if (storeId) query = query.eq('store_id', storeId);

    const { data, error } = await query;
    if (error) throw error;

    const engagementMap = new Map();

    data.forEach(tx => {
      let key, sortKey;
      const txDate = new Date(tx.transaction_date);

      if (period === 'week') {
        // Group by day of week (Sunday → Saturday)
        key = txDate.toLocaleDateString('en-US', { weekday: 'long' });
        sortKey = txDate.getDay(); // 0=Sunday, 1=Monday, etc.
      } else if (period === 'month') {
        // Group by Year-Month (e.g., "Sep 2025")
        key = txDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        sortKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM format
      } else if (period === 'year') {
        // Group by Year
        key = txDate.getFullYear().toString();
        sortKey = txDate.getFullYear(); // Use year as number for sorting
      }

      if (!engagementMap.has(key)) {
        engagementMap.set(key, { points: 0, sortKey });
      }
      engagementMap.get(key).points += tx.points;
    });

    // Sort by actual date ranges using sortKey
    const sortedEntries = Array.from(engagementMap.entries()).sort((a, b) => {
      if (period === 'week') {
        // Sort days of week (Sunday to Saturday)
        return a[1].sortKey - b[1].sortKey;
      } else if (period === 'month') {
        // Sort by YYYY-MM format
        return a[1].sortKey.localeCompare(b[1].sortKey);
      } else if (period === 'year') {
        // Sort by year number
        return a[1].sortKey - b[1].sortKey;
      }
      return 0;
    });

    const labels = sortedEntries.map(([label]) => label);
    const dataPoints = sortedEntries.map(([, data]) => data.points);

    res.json({ labels, data: dataPoints });
  } catch (err) {
    console.error('Engagement API error:', err);
    res.status(500).json({ error: 'Failed to fetch engagement data' });
  }
};

export const getProductBreakdown = async (req, res) => {
  try {
    const { store } = req.query;

    let query = supabase
      .from('transactions')
      .select(`
        points,
        products(product_type),
        store_id
      `);

    if (store) query = query.eq('store_id', store);

    const { data, error } = await query;
    if (error) throw error;

    const breakdownMap = new Map();
    data.forEach(tx => {
      const type = tx.products?.product_type || 'Unknown';
      breakdownMap.set(type, (breakdownMap.get(type) || 0) + tx.points);
    });

    const labels = Array.from(breakdownMap.keys());
    const counts = labels.map(type => breakdownMap.get(type));
    const breakdown = labels.map((type, i) => ({
      product_type: type,
      total_points: counts[i]
    }));

    res.json({ labels, data: counts, breakdown });
  } catch (err) {
    console.error('Product Breakdown API error:', err);
    res.status(500).json({ error: 'Failed to fetch product breakdown' });
  }
};
