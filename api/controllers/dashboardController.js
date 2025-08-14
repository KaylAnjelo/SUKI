import supabase from '../../config/db.js';

// Helper
export function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

export const getDashboard = async (req, res) => {
  try {
    // Store Owners Count
    const { count: totalStoreOwners, error: storeOwnersError } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true });
    if (storeOwnersError) throw storeOwnersError;

    // Customers Count
    const { count: totalCustomers, error: customersError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (customersError) throw customersError;

    // Total Points
    const { data: totalPointsData, error: totalPointsError } = await supabase
      .from('user_points')
      .select('total_points');
    if (totalPointsError) throw totalPointsError;
    const totalPoints = totalPointsData?.reduce((sum, row) => sum + (row.total_points || 0), 0) || 0;

    // Total Redeemed Points
    const { data: totalRedeemData, error: totalRedeemError } = await supabase
      .from('user_points')
      .select('redeemed_points');
    if (totalRedeemError) throw totalRedeemError;
    const totalRedeem = totalRedeemData?.reduce((sum, row) => sum + (row.redeemed_points || 0), 0) || 0;

    // Recent Transactions (with user and store info) - last 12 weeks for weekly chart
    const now = new Date();
    const getWeekStart = (d) => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const day = date.getUTCDay(); // 0=Sun..6=Sat
      const diffToMonday = (day === 0 ? -6 : 1) - day; // Monday as start of week
      date.setUTCDate(date.getUTCDate() + diffToMonday);
      date.setUTCHours(0, 0, 0, 0);
      return date;
    };
    const currentWeekStart = getWeekStart(now);
    const startWeekStart = new Date(currentWeekStart);
    startWeekStart.setUTCDate(startWeekStart.getUTCDate() - 11 * 7); // 12 weeks window
    const startOfWindow = startWeekStart.toISOString().slice(0, 10);
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('transaction_date, points, users(username), stores(store_name)')
      .gte('transaction_date', startOfWindow)
      .order('transaction_date', { ascending: true });
    if (transactionsError) throw transactionsError;

    // Stores
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('store_name, location, is_active');
    if (storesError) throw storesError;

    // Build HTML
    let transactionTableRowsHtml = '';
    let totalPointsCalc = 0;
    let storesTableRowsHtml = '';
    
    // Prepare datasets for charts
    // Weekly aggregation: key YYYY-MM-DD (week start), value sum of points
    const pointsPerWeekMap = new Map();
    const storeEngagementMap = new Map(); // key: store_name, value: count of transactions

    if (transactions && transactions.length > 0) {
      transactions.forEach(transaction => {
        transactionTableRowsHtml += `
          <tr>
            <td>${formatDate(transaction.transaction_date)}</td>
            <td>${transaction.users?.username || ''}</td>
            <td>${transaction.points}</td>
            <td>${transaction.stores?.store_name || ''}</td>
          </tr>
        `;
        totalPointsCalc += transaction.points;

        // Aggregate points per week (week starts Monday)
        const txDate = new Date(transaction.transaction_date);
        const weekStart = getWeekStart(txDate);
        const weekKey = weekStart.toISOString().slice(0, 10); // YYYY-MM-DD
        const currentPoints = pointsPerWeekMap.get(weekKey) || 0;
        pointsPerWeekMap.set(weekKey, currentPoints + (Number(transaction.points) || 0));

        // Count engagement per store (number of transactions per store)
        const storeName = transaction.stores?.store_name || 'Unknown';
        const currentCount = storeEngagementMap.get(storeName) || 0;
        storeEngagementMap.set(storeName, currentCount + 1);
      });
    } else {
      transactionTableRowsHtml = '<tr><td colspan="4">No transactions available.</td></tr>';
    }

    if (stores && stores.length > 0) {
      stores.forEach(store => {
        storesTableRowsHtml += `
          <tr>
            <td>${store.store_name}</td>
            <td>${store.location || 'N/A'}</td>
            <td>${store.is_active ? 'Active' : 'Inactive'}</td>
          </tr>
        `;
      });
    } else {
      storesTableRowsHtml = '<tr><td colspan="3">No stores available.</td></tr>';
    }

    // Build chart arrays (reuse existing variable names for the template)
    // Ensure continuous weeks across the window
    const weekKeys = [];
    for (let d = new Date(startWeekStart); d <= currentWeekStart; d.setUTCDate(d.getUTCDate() + 7)) {
      weekKeys.push(d.toISOString().slice(0, 10));
      if (!pointsPerWeekMap.has(d.toISOString().slice(0, 10))) {
        pointsPerWeekMap.set(d.toISOString().slice(0, 10), 0);
      }
    }
    const pointsPerDayLabels = weekKeys.map(ws => {
      const start = new Date(ws + 'T00:00:00Z');
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      const mmdd = (dt) => `${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${String(dt.getUTCDate()).padStart(2, '0')}`;
      return `${mmdd(start)} - ${mmdd(end)}`;
    });
    const pointsPerDayData = weekKeys.map(ws => Number((pointsPerWeekMap.get(ws) || 0).toFixed(2)));

    const storeLabels = Array.from(storeEngagementMap.keys());
    const storeEngagementData = storeLabels.map(s => storeEngagementMap.get(s) || 0);

    res.render('Dashboard', {
      title: 'Dashboard',
      total_owners: totalStoreOwners || 0,
      total_customers: totalCustomers || 0,
      total_points: totalPointsCalc,
      redeemed_points: totalRedeem,
      transactionTableRows: transactionTableRowsHtml,
      storesTableRows: storesTableRowsHtml,
      pointsPerDayLabels: JSON.stringify(pointsPerDayLabels),
      pointsPerDayData: JSON.stringify(pointsPerDayData),
      storeLabels: JSON.stringify(storeLabels),
      storeEngagementData: JSON.stringify(storeEngagementData),
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
};
