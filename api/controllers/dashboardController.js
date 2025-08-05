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

    // Recent Transactions (with user and store info)
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('transaction_date, points, users(username), stores(store_name)')
      .order('transaction_date', { ascending: false })
      .limit(10);
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

    res.render('Dashboard', {
      title: 'Dashboard',
      total_owners: totalStoreOwners || 0,
      total_customers: totalCustomers || 0,
      total_points: totalPointsCalc,
      redeemed_points: totalRedeem,
      transactionTableRows: transactionTableRowsHtml,
      storesTableRows: storesTableRowsHtml,
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
};
