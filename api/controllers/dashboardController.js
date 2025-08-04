import db from '../../config/db.js';

// Helper
export function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

export const getDashboard = async (req, res) => {
  try {
    const storeOwnersResult = await db.query('SELECT COUNT(*) FROM stores');
    const totalStoreOwners = parseInt(storeOwnersResult.rows[0].count, 10);

    const customersResult = await db.query('SELECT COUNT(*) FROM users');
    const totalCustomers = parseInt(customersResult.rows[0].count, 10);

    const totalpointsResult = await db.query('SELECT COALESCE(SUM(total_points), 0) AS total_points_sum FROM user_points');
    const totalPoints = totalpointsResult.rows[0].total_points_sum;

    const redeempointsResult = await db.query('SELECT COALESCE(SUM(redeemed_points), 0) AS total_redeemed_points_sum FROM user_points');
    const totalRedeem = redeempointsResult.rows[0].total_redeemed_points_sum;

    const transactionQuery = `
      SELECT t.transaction_date, u.username, t.points, s.store_name
      FROM transactions t
      JOIN users u ON t.user_id = u.user_id
      JOIN stores s ON t.store_id = s.owner_id
      ORDER BY t.transaction_date DESC
      LIMIT 10;
    `;
    const transactionResult = await db.query(transactionQuery);
    const transactions = transactionResult.rows;

    const storesResult = await db.query('SELECT store_name, location, is_active FROM stores');
    const stores = storesResult.rows;

    let transactionTableRowsHtml = '';
    let totalPointsCalc = 0;
    let storesTableRowsHtml = '';

    if (transactions.length > 0) {
      transactions.forEach(transaction => {
        transactionTableRowsHtml += `
          <tr>
            <td>${formatDate(transaction.transaction_date)}</td>
            <td>${transaction.username}</td>
            <td>${transaction.points}</td>
            <td>${transaction.store_name}</td>
          </tr>
        `;
        totalPointsCalc += transaction.points;
      });
    } else {
      transactionTableRowsHtml = '<tr><td colspan="4">No transactions available.</td></tr>';
    }

    if (stores.length > 0) {
      stores.forEach(store => {
        storesTableRowsHtml += `
          <tr>
            <td>${store.store_name}</td>
            <td>${store.location || 'N/A'}</td>
            <td>${store.status || 'N/A'}</td>
          </tr>
        `;
      });
    } else {
      storesTableRowsHtml = '<tr><td colspan="3">No stores available.</td></tr>';
    }

    res.render('Dashboard', {
      title: 'Dashboard',
      total_owners: totalStoreOwners,
      total_customers: totalCustomers,
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
