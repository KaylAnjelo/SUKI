import supabase from '../../config/db.js';
import PDFDocument from 'pdfkit';
import { formatDate, formatDateMDY } from '../utils/date.js';
import { generateReferenceNumber } from '../utils/reference.js';
import { applyDateRange } from '../utils/query.js';
import { escapeCsv, setCsvHeaders } from '../utils/csv.js';
import { buildFiltersSummary, createRowDrawer } from '../utils/pdf.js';

// Base query builder with proper joins
const getBaseTransactionsQuery = () => {
  return supabase
    .from('transactions')
    .select(`
      id,
      transaction_date,
      user_id,
      store_id,
      product_id,
      quantity,
      price,
      total,
      points,
      reference_number,
      transaction_type,
      products!fk_transactions_product (
        id,
        product_name,
        price,
        product_type
      ),
      users!fk_transactions_user (
        user_id,
        username,
        first_name,
        last_name,
        role
      ),
      stores!fk_transactions_store (
        store_id,
        store_name,
        owner_id
      )
    `);
};

export const getSalesWithTotals = async (req, res) => {
  try {
    const { store_id, date } = req.query;

    if (!store_id || !date) {
      return res.status(400).json({ error: 'store_id and date are required' });
    }

    const { data, error } = await getBaseTransactionsQuery()
      .eq('store_id', store_id)
      .eq('transaction_date', date);

    if (error) throw error;

    // Transform data with proper product names
    const salesData = data.map(row => ({
      product_name: row.products?.product_name || 'Unknown Product',
      quantity: row.quantity,
      price: row.price,
      total: row.total
    }));

    const totals = {
      totalQuantity: data.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
      totalAmount: data.reduce((sum, row) => sum + (Number(row.total) || 0), 0)
    };

    res.json({
      sales: salesData,
      totals
    });

  } catch (err) {
    console.error('Error in getSalesWithTotals:', err);
    res.status(500).json({ error: err.message });
  }
};

export const getReports = async (req, res) => {
  try {
    // Get stores for filter dropdown
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('is_active', true)
      .order('store_name');
    
    if (storesError) throw storesError;

    // Get recent transactions with joins
    const { data: transactions, error: transactionsError } = await getBaseTransactionsQuery()
      .order('transaction_date', { ascending: false })
      .limit(100); // Limit initial load for performance

    if (transactionsError) throw transactionsError;

    // Build sales data with proper joins
    const sales = transactions.map(t => ({
      transaction_date: t.transaction_date,
      store_name: t.stores?.store_name || 'Unknown Store',
      reference_number: t.reference_number,
      products_sold: t.products?.product_name ? `${t.products.product_name} (x${t.quantity})` : 'N/A',
      total_amount: t.total || 0
    }));

    // Generate HTML table rows
    let salesTableRowsHtml = '';
    if (sales.length > 0) {
      sales.forEach(sale => {
        salesTableRowsHtml += `
          <tr>
            <td>${formatDate(sale.transaction_date)}</td>
            <td>${sale.store_name}</td>
            <td>${sale.reference_number}</td>
            <td>${sale.products_sold}</td>
            <td>₱${parseFloat(sale.total_amount).toFixed(2)}</td>
          </tr>
        `;
      });
    } else {
      salesTableRowsHtml = '<tr><td colspan="5">No sales data available.</td></tr>';
    }

    // Store filter dropdown options (use store_id as value for precise filtering)
    let storeFilterOptionsHtml = '<option value="">All Stores</option>';
    stores.forEach(store => {
      storeFilterOptionsHtml += `<option value="${store.store_id}">${store.store_name}</option>`;
    });

    res.render('reports/sales', {
      title: 'Sales Reports',
      salesTableRows: salesTableRowsHtml,
      storeFilterOptions: storeFilterOptionsHtml,
      initialSalesData: JSON.stringify(sales)
    });

  } catch (error) {
    console.error('Error fetching sales reports:', error.stack);
    res.status(500).send('Internal Server Error');
  }
};

// Optimized filtered sales builder
async function buildFilteredSales({ startDate, endDate, store, sortOrder }) {
  let query = getBaseTransactionsQuery();

  // Apply date range filter
  query = applyDateRange(query, 'transaction_date', startDate, endDate);

  // Apply store filter using store_id for precise matching
  if (store) {
    // when filtering by joined table, compare the foreign key directly
    query = query.eq('store_id', store);
  }

  // Apply sorting
  const ascending = sortOrder === 'oldest';
  query = query.order('transaction_date', { ascending });

  const { data: transactions, error } = await query;
  if (error) throw error;

  // Transform data
  return transactions.map(t => ({
    transaction_date: t.transaction_date,
    store_name: t.stores?.store_name || 'Unknown Store',
    reference_number: t.reference_number,
    products_sold: t.products?.product_name ? `${t.products.product_name} (x${t.quantity})` : 'N/A',
    total_amount: t.total || 0
  }));
}

// Optimized filtered transactions builder
async function buildFilteredUserTransactions({ startDate, endDate, user, userType, transactionType, sortOrder }) {
  let query = getBaseTransactionsQuery();

  // Normalize type casing to match DB enum/check ('Purchase', 'Redemption', 'Refund')
  const normalizedTransactionType = transactionType
    ? String(transactionType).charAt(0).toUpperCase() + String(transactionType).slice(1).toLowerCase()
    : undefined;

  // Apply date range filter
  query = applyDateRange(query, 'transaction_date', startDate, endDate);

  // Apply transaction type filter
  if (normalizedTransactionType) {
    query = query.eq('transaction_type', normalizedTransactionType);
  }

  // Apply user filter
  if (user) {
    query = query.eq('users.username', user);
  }

  // Apply user type filter if needed
  if (userType) {
    // This would require joining with users table and filtering by user_type
    // Implement based on your users table structure
  }

  // Apply sorting
  const ascending = sortOrder === 'oldest';
  query = query.order('transaction_date', { ascending });

  const { data: transactions, error } = await query;
  if (error) throw error;

  return transactions.map(t => ({
    date_time: t.transaction_date,
    user: t.users?.username || 'Unknown User',
    transaction_type: t.transaction_type || 'Purchase',
    transaction_id: t.reference_number,
    amount: t.total || 0,
    store_name: t.stores?.store_name || 'Unknown Store',
    product_details: t.products?.product_name ? `${t.products.product_name} (x${t.quantity})` : 'N/A',
    points: t.points || 0
  }));
}

// Optimized filtered activity builder
async function buildFilteredActivity({ startDate, endDate, user, activityType, sortOrder }) {
  let query = getBaseTransactionsQuery();

  // Normalize type casing to match DB values
  const normalizedActivityType = activityType
    ? String(activityType).charAt(0).toUpperCase() + String(activityType).slice(1).toLowerCase()
    : undefined;

  // Apply date range filter
  query = applyDateRange(query, 'transaction_date', startDate, endDate);

  // Apply user filter
  if (user) {
    query = query.eq('users.username', user);
  }

  // Apply activity type filter (using transaction_type as activity_type)
  if (normalizedActivityType) {
    query = query.eq('transaction_type', normalizedActivityType);
  }

  // Apply sorting
  const ascending = sortOrder === 'oldest';
  query = query.order('transaction_date', { ascending });

  const { data: transactions, error } = await query;
  if (error) throw error;

  return transactions.map(t => ({
    date_time: t.transaction_date,
    user: t.users?.username || 'Unknown User',
    user_full_name: t.users ? `${t.users.first_name || ''} ${t.users.last_name || ''}`.trim() : '',
    user_role: t.users?.role || 'customer',
    activity_type: t.transaction_type || 'Purchase',
    details: t.products?.product_name ? `${t.products.product_name} (x${t.quantity})` : 'N/A',
    store_name: t.stores?.store_name || 'Unknown Store',
    amount: t.total || 0,
    points: t.points || 0,
    status: 'Completed'
  }));
}

// Unified filter endpoint handler
export const filterReports = async (req, res) => {
  try {
    const { startDate, endDate, store, user, userType, activityType, transactionType, sortOrder } = req.body;
    
    if (req.path.includes('/sales/filter')) {
      const sales = await buildFilteredSales({ startDate, endDate, store, sortOrder });
      return res.json(sales);
    }
    
    if (req.path.includes('/transactions/filter')) {
      const transactions = await buildFilteredUserTransactions({ 
        startDate, endDate, user, userType, transactionType, sortOrder 
      });
      return res.json(transactions);
    }
    
    if (req.path.includes('/activity/filter')) {
      const activity = await buildFilteredActivity({ 
        startDate, endDate, user, activityType, sortOrder 
      });
      return res.json(activity);
    }

    res.status(400).json({ error: 'Unsupported filter type' });
  } catch (error) {
    console.error('Error filtering reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Optimized users and stores for dropdowns
export const getUsersForFilter = async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('username')
      .not('username', 'is', null)
      .order('username');
    
    if (error) throw error;
    
    const userList = users.map(u => u.username);
    res.json(userList);
  } catch (error) {
    console.error('Error fetching users for filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserRolesForFilter = async (req, res) => {
  try {
    const { data: roles, error } = await supabase
      .from('users')
      .select('role')
      .not('role', 'is', null);
    
    if (error) throw error;
    
    // Get unique roles
    const uniqueRoles = [...new Set(roles.map(r => r.role))].sort();
    res.json(uniqueRoles);
  } catch (error) {
    console.error('Error fetching user roles for filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getStoresForFilter = async (req, res) => {
  try {
    const { data: stores, error } = await supabase
      .from('stores')
      .select('store_name')
      .eq('is_active', true)
      .order('store_name');
    
    if (error) throw error;
    
    const storeList = stores.map(s => s.store_name);
    res.json(storeList);
  } catch (error) {
    console.error('Error fetching stores for filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// CSV Export Functions
export const exportSalesCsv = async (req, res) => {
  try {
    const { startDate, endDate, store, sortOrder, filename } = req.query;
    const sales = await buildFilteredSales({ startDate, endDate, store, sortOrder });

    const safeName = (filename && String(filename).trim()) || 'sales-report';
    setCsvHeaders(res, safeName);

    const header = ['Date', 'Store', 'Reference Number', 'Products Sold', 'Total Amount'];
    const lines = [header.map(escapeCsv).join(',')].concat(
      sales.map(row => [
        escapeCsv(formatDateMDY(row.transaction_date)),
        escapeCsv(row.store_name),
        escapeCsv(row.reference_number),
        escapeCsv(row.products_sold),
        escapeCsv(Number(row.total_amount).toFixed(2))
      ].join(','))
    );

    res.write(lines.join('\n'));
    res.end();
  } catch (error) {
    console.error('Error exporting sales CSV:', error);
    res.status(500).send('Failed to generate CSV');
  }
};

export const exportTransactionsCsv = async (req, res) => {
  try {
    const { startDate, endDate, user, transactionType, sortOrder, filename } = req.query;
    const transactions = await buildFilteredUserTransactions({ 
      startDate, endDate, user, transactionType, sortOrder 
    });

    const safeName = (filename && String(filename).trim()) || 'transactions-report';
    setCsvHeaders(res, safeName);

    const header = ['Date', 'User', 'Transaction Type', 'Reference Number', 'Amount', 'Store', 'Product Details'];
    const lines = [header.map(escapeCsv).join(',')].concat(
      transactions.map(row => [
        escapeCsv(formatDateMDY(row.date_time)),
        escapeCsv(row.user),
        escapeCsv(row.transaction_type),
        escapeCsv(row.transaction_id),
        escapeCsv(Number(row.amount).toFixed(2)),
        escapeCsv(row.store_name),
        escapeCsv(row.product_details)
      ].join(','))
    );

    res.write(lines.join('\n'));
    res.end();
  } catch (error) {
    console.error('Error exporting transactions CSV:', error);
    res.status(500).send('Failed to generate CSV');
  }
};

export const exportActivityCsv = async (req, res) => {
  try {
    const { startDate, endDate, user, activityType, sortOrder, filename } = req.query;
    const activity = await buildFilteredActivity({ startDate, endDate, user, activityType, sortOrder });

    const safeName = (filename && String(filename).trim()) || 'activity-report';
    setCsvHeaders(res, safeName);

    const header = ['Date', 'User', 'Activity Type', 'Details', 'Status'];
    const lines = [header.map(escapeCsv).join(',')].concat(
      activity.map(row => [
        escapeCsv(formatDateMDY(row.date_time)),
        escapeCsv(row.user || ''),
        escapeCsv(row.activity_type),
        escapeCsv(row.details),
        escapeCsv(row.status || 'Completed')
      ].join(','))
    );

    res.write(lines.join('\n'));
    res.end();
  } catch (error) {
    console.error('Error exporting activity CSV:', error);
    res.status(500).send('Failed to generate CSV');
  }
};

// PDF Export Functions
export const exportSalesPdf = async (req, res) => {
  try {
    const { startDate, endDate, store, sortOrder, filename } = req.query;
    const sales = await buildFilteredSales({ startDate, endDate, store, sortOrder });

    const safeName = (filename && String(filename).trim()) || 'sales-report';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    // Title
    doc.fontSize(16).text('Sales Report', { align: 'center' });
    doc.moveDown(0.5);

    // Filters summary
    const filtersSummary = buildFiltersSummary({ startDate, endDate, store, sortOrder }, formatDateMDY);
    if (filtersSummary) {
      doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
      doc.moveDown(0.5);
    }
    doc.fillColor('#000');

    // Table
    const headers = ['Date', 'Store', 'Reference #', 'Products Sold', 'Total'];
    const columnWidths = [90, 100, 100, 180, 60];
    const startX = doc.page.margins.left;
    const { drawRow } = createRowDrawer(doc, startX, columnWidths);

    drawRow(headers, true);
    sales.forEach(row => {
      drawRow([
        formatDateMDY(row.transaction_date),
        row.store_name,
        row.reference_number,
        row.products_sold,
        Number(row.total_amount).toFixed(2)
      ]);
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting sales PDF:', error);
    res.status(500).send('Failed to generate PDF');
  }
};

export const exportTransactionsPdf = async (req, res) => {
  try {
    const { startDate, endDate, user, transactionType, sortOrder, filename } = req.query;
    const transactions = await buildFilteredUserTransactions({ 
      startDate, endDate, user, transactionType, sortOrder 
    });

    const safeName = (filename && String(filename).trim()) || 'transactions-report';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('User Transaction Report', { align: 'center' });
    doc.moveDown(0.5);

    const filtersSummary = buildFiltersSummary({ startDate, endDate, user, transactionType, sortOrder }, formatDateMDY);
    if (filtersSummary) {
      doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
      doc.moveDown(0.5);
    }
    doc.fillColor('#000');

    const headers = ['Date', 'User', 'Type', 'Reference #', 'Amount', 'Store', 'Details'];
    const columnWidths = [70, 60, 60, 80, 50, 80, 120];
    const startX = doc.page.margins.left;
    const { drawRow } = createRowDrawer(doc, startX, columnWidths);

    drawRow(headers, true);
    transactions.forEach(row => {
      drawRow([
        formatDateMDY(row.date_time),
        row.user,
        row.transaction_type,
        row.transaction_id,
        Number(row.amount).toFixed(2),
        row.store_name,
        row.product_details
      ]);
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting transactions PDF:', error);
    res.status(500).send('Failed to generate PDF');
  }
};

export const exportActivityPdf = async (req, res) => {
  try {
    const { startDate, endDate, user, activityType, sortOrder, filename } = req.query;
    const activity = await buildFilteredActivity({ startDate, endDate, user, activityType, sortOrder });

    const safeName = (filename && String(filename).trim()) || 'activity-report';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('User Activity Report', { align: 'center' });
    doc.moveDown(0.5);

    const filtersSummary = buildFiltersSummary({ startDate, endDate, user, activityType, sortOrder }, formatDateMDY);
    if (filtersSummary) {
      doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
      doc.moveDown(0.5);
    }
    doc.fillColor('#000');

    const headers = ['Date', 'User', 'Activity', 'Details', 'Status'];
    const columnWidths = [80, 80, 80, 180, 60];
    const startX = doc.page.margins.left;
    const { drawRow } = createRowDrawer(doc, startX, columnWidths);

    drawRow(headers, true);
    activity.forEach(row => {
      drawRow([
        formatDateMDY(row.date_time),
        row.user || '',
        row.activity_type,
        row.details,
        row.status || 'Completed'
      ]);
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting activity PDF:', error);
    res.status(500).send('Failed to generate PDF');
  }
};