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
      Vendor_ID,
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
async function buildFilteredUserTransactions({ startDate, endDate, user, customer, vendor, userType, transactionType, sortOrder, store }) {
  let query = getBaseTransactionsQuery();

  // Normalize type casing to match DB enum/check ('Purchase', 'Redemption', 'Refund')
  const normalizedTransactionType = transactionType
    ? String(transactionType).charAt(0).toUpperCase() + String(transactionType).slice(1).toLowerCase()
    : undefined;

  // Apply date range filter
  query = applyDateRange(query, 'transaction_date', startDate, endDate);

  // Determine sort direction early so vendor-merge branch can use it
  const ascending = sortOrder === 'oldest';

  // Apply store filter (accepts store_id)
  if (store) {
    // If frontend sends a numeric id, filter by foreign key
    const storeStr = String(store);
    if (/^\d+$/.test(storeStr)) {
      query = query.eq('store_id', storeStr);
    } else {
      // fallback: match by store name
      query = query.eq('stores.store_name', storeStr);
    }
  }

  // Apply transaction type filter
  if (normalizedTransactionType) {
    query = query.eq('transaction_type', normalizedTransactionType);
  }

  // Apply user filters. Support three modes:
  // - both `customer` and `vendor` provided: require transactions where `user_id` == customer AND `Vendor_ID` == vendor
  // - only `customer` provided: require `user_id` == customer
  // - only `vendor` provided: keep existing vendor behavior (merge actor queries so vendor acts as either `user_id` or `Vendor_ID`)
  let combinedData = null;
  const customerStr = customer ? String(customer) : null;
  const vendorStr = vendor ? String(vendor) : null;

  if (customerStr && vendorStr) {
    // intersection: both must match
    // apply both filters directly using the base query
    query = applyDateRange(query, 'transaction_date', startDate, endDate);
    if (store) {
      const storeStr = String(store);
      if (/^\d+$/.test(storeStr)) query = query.eq('store_id', storeStr);
      else query = query.eq('stores.store_name', storeStr);
    }
    if (normalizedTransactionType) query = query.eq('transaction_type', normalizedTransactionType);
    // require both user_id and Vendor_ID
    query = query.eq('user_id', customerStr).eq('Vendor_ID', vendorStr);
  } else if (customerStr) {
    // only customer filter
    query = query.eq('user_id', customerStr);
  } else if (vendorStr) {
    // vendor-only: keep prior merge behavior (vendor may be actor in user_id or Vendor_ID)
    try {
      const { data: urow, error: uerr } = await supabase
        .from('users')
        .select('role')
        .eq('user_id', vendorStr)
        .maybeSingle();

      if (!uerr && urow && String(urow.role).toLowerCase() === 'vendor') {
        // vendor: run two actor queries and merge results
        const q1_user = getBaseTransactionsQuery();
        let q1u = applyDateRange(q1_user, 'transaction_date', startDate, endDate);
        if (store) {
          const storeStr = String(store);
          if (/^\d+$/.test(storeStr)) q1u = q1u.eq('store_id', storeStr);
          else q1u = q1u.eq('stores.store_name', storeStr);
        }
        if (normalizedTransactionType) q1u = q1u.eq('transaction_type', normalizedTransactionType);
        q1u = q1u.eq('user_id', vendorStr).order('transaction_date', { ascending });

        const q1_vendor = getBaseTransactionsQuery();
        let q1v = applyDateRange(q1_vendor, 'transaction_date', startDate, endDate);
        if (store) {
          const storeStr = String(store);
          if (/^\d+$/.test(storeStr)) q1v = q1v.eq('store_id', storeStr);
          else q1v = q1v.eq('stores.store_name', storeStr);
        }
        if (normalizedTransactionType) q1v = q1v.eq('transaction_type', normalizedTransactionType);
        q1v = q1v.eq('Vendor_ID', vendorStr).order('transaction_date', { ascending });

        const [res1u, res1v] = await Promise.all([q1u, q1v]);
        const dataArr1 = [];
        if (res1u && Array.isArray(res1u.data)) dataArr1.push(...res1u.data);
        if (res1v && Array.isArray(res1v.data)) dataArr1.push(...res1v.data);

        // Deduplicate by reference_number or id
        const merged = [];
        const seen = new Set();
        dataArr1.forEach(t => {
          const key = t.reference_number || t.id || JSON.stringify(t);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(t);
          }
        });

        // Sort merged results by transaction_date according to requested order
        try {
          const asc = ascending;
          merged.sort((a, b) => {
            const da = new Date(a.transaction_date || a.transaction_date);
            const db = new Date(b.transaction_date || b.transaction_date);
            return asc ? da - db : db - da;
          });
        } catch (e) {}

        combinedData = merged;
      } else {
        // not a vendor: filter by user_id
        query = query.eq('user_id', vendorStr);
      }
    } catch (e) {
      query = query.eq('user_id', vendorStr);
    }
  }

  // Apply user type filter if needed
  if (userType) {
    // This would require joining with users table and filtering by user_type
    // Implement based on your users table structure
  }

  // Apply sorting for non-merged query path
  query = query.order('transaction_date', { ascending });

  let transactions;
  if (combinedData) {
    transactions = combinedData;
  } else {
    const { data: txData, error } = await query;
    if (error) throw error;
    transactions = txData;
  }

  // If some transactions use Vendor_ID as the actor (and don't have `users` joined),
  // resolve vendor names in bulk to avoid per-row queries.
  const vendorIds = Array.from(new Set((transactions || [])
    .map(t => (t.Vendor_ID || t.vendor_id))
    .filter(Boolean)
  ));

  let vendorMap = {};
  if (vendorIds.length > 0) {
    try {
      const { data: vrows, error: verr } = await supabase
        .from('users')
        .select('user_id, username, first_name, last_name')
        .in('user_id', vendorIds);
      if (!verr && Array.isArray(vrows)) {
          vrows.forEach(v => {
            const name = `${v.first_name || ''} ${v.last_name || ''}`.trim() || v.username;
            vendorMap[String(v.user_id)] = name;
          });
        }
    } catch (e) {
      // ignore resolution errors; we'll fallback to Unknown User
    }
  }

  // If the filter selected a vendor (vendorStr earlier), prefer showing that vendor
  // as the actor for rows where Vendor_ID matches the selected vendor, even if a `users` join exists.
  const selectedVendorId = (vendorStr && /^\d+$/.test(String(vendorStr))) ? String(vendorStr) : null;

  return (transactions || []).map(t => {
    const vendorIdVal = String(t.Vendor_ID || t.vendor_id || '');

    let userDisplay = 'Unknown User';
    let userType = 'customer';

    // Prefer showing the customer (the `users` join) as the `user` column
    // even when a vendor filter is applied. Only fall back to vendor name
    // when no customer/user information exists on the transaction row.
    if (t.users) {
      userDisplay = (`${t.users.first_name || ''} ${t.users.last_name || ''}`.trim() || t.users.username) || 'Unknown User';
      userType = t.users?.role || 'customer';
    } else if (vendorIdVal) {
      userDisplay = vendorMap[vendorIdVal] || `Vendor #${vendorIdVal}`;
      userType = 'vendor';
    }

    return {
      date_time: t.transaction_date,
      user: userDisplay,
      user_type: userType,
      transaction_type: t.transaction_type || 'Purchase',
      transaction_id: t.reference_number,
      amount: t.total || 0,
      store_name: t.stores?.store_name || 'Unknown Store',
      product_details: t.products?.product_name ? `${t.products.product_name} (x${t.quantity})` : 'N/A',
      vendor: vendorIdVal ? (vendorMap[vendorIdVal] || `Vendor #${vendorIdVal}`) : '',
      points: t.points || 0
    };
  });
}

// Optimized filtered activity builder
async function buildFilteredActivity({ startDate, endDate, user, customer, vendor, activityType, sortOrder, store }) {
  let query = getBaseTransactionsQuery();

  // Normalize type casing to match DB values
  const normalizedActivityType = activityType
    ? String(activityType).charAt(0).toUpperCase() + String(activityType).slice(1).toLowerCase()
    : undefined;

  // Apply date range filter
  query = applyDateRange(query, 'transaction_date', startDate, endDate);

  // Determine sort direction early so vendor-merge branch can use it
  const ascending = sortOrder === 'oldest';

  // Apply store filter (accepts store_id)
  if (store) {
    const storeStr = String(store);
    if (/^\d+$/.test(storeStr)) {
      query = query.eq('store_id', storeStr);
    } else {
      query = query.eq('stores.store_name', storeStr);
    }
  }

  // Apply user/customer/vendor filters for activity page.
  // If both customer and vendor are provided, require intersection (user_id == customer AND Vendor_ID == vendor).
  let combinedData = null;
  const customerStr = customer ? String(customer) : (user ? String(user) : null);
  const vendorStr = vendor ? String(vendor) : null;

  if (customerStr && vendorStr) {
    // intersection
    query = applyDateRange(query, 'transaction_date', startDate, endDate);
    if (store) {
      const storeStr = String(store);
      if (/^\d+$/.test(storeStr)) query = query.eq('store_id', storeStr);
      else query = query.eq('stores.store_name', storeStr);
    }
    if (normalizedActivityType) query = query.eq('transaction_type', normalizedActivityType);
    query = query.eq('user_id', customerStr).eq('Vendor_ID', vendorStr);
  } else if (customerStr) {
    query = query.eq('user_id', customerStr);
  } else if (vendorStr) {
    // vendor-only: preserve vendor merge behavior
    try {
      const { data: urow, error: uerr } = await supabase
        .from('users')
        .select('role')
        .eq('user_id', vendorStr)
        .maybeSingle();

      if (!uerr && urow && String(urow.role).toLowerCase() === 'vendor') {
        const q1_user = getBaseTransactionsQuery();
        let q1u = applyDateRange(q1_user, 'transaction_date', startDate, endDate);
        if (store) {
          const storeStr = String(store);
          if (/^\d+$/.test(storeStr)) q1u = q1u.eq('store_id', storeStr);
          else q1u = q1u.eq('stores.store_name', storeStr);
        }
        if (normalizedActivityType) q1u = q1u.eq('transaction_type', normalizedActivityType);
        q1u = q1u.eq('user_id', vendorStr).order('transaction_date', { ascending });

        const q1_vendor = getBaseTransactionsQuery();
        let q1v = applyDateRange(q1_vendor, 'transaction_date', startDate, endDate);
        if (store) {
          const storeStr = String(store);
          if (/^\d+$/.test(storeStr)) q1v = q1v.eq('store_id', storeStr);
          else q1v = q1v.eq('stores.store_name', storeStr);
        }
        if (normalizedActivityType) q1v = q1v.eq('transaction_type', normalizedActivityType);
        q1v = q1v.eq('Vendor_ID', vendorStr).order('transaction_date', { ascending });

        const [res1u, res1v] = await Promise.all([q1u, q1v]);
        const dataArr1 = [];
        if (res1u && Array.isArray(res1u.data)) dataArr1.push(...res1u.data);
        if (res1v && Array.isArray(res1v.data)) dataArr1.push(...res1v.data);

        const merged = [];
        const seen = new Set();
        dataArr1.forEach(t => {
          const key = t.reference_number || t.id || JSON.stringify(t);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(t);
          }
        });

        combinedData = merged;
      } else {
        query = query.eq('user_id', vendorStr);
      }
    } catch (e) {
      query = query.eq('user_id', vendorStr);
    }
  }

  // Apply activity type filter (using transaction_type as activity_type)
  if (normalizedActivityType) {
    query = query.eq('transaction_type', normalizedActivityType);
  }

  // Apply sorting for non-merged path
  query = query.order('transaction_date', { ascending });

  let transactions;
  if (combinedData) {
    transactions = combinedData;
  } else {
    const { data: txData, error } = await query;
    if (error) throw error;
    transactions = txData;
  }
  // Resolve vendor names if some rows use Vendor_ID instead of users join
  const vendorIds = Array.from(new Set((transactions || [])
    .map(t => (t.Vendor_ID || t.vendor_id))
    .filter(Boolean)
  ));

  let vendorMap = {};
  if (vendorIds.length > 0) {
    try {
      const { data: vrows, error: verr } = await supabase
        .from('users')
        .select('user_id, username, first_name, last_name')
        .in('user_id', vendorIds);
      if (!verr && Array.isArray(vrows)) {
        vrows.forEach(v => {
          const name = `${v.first_name || ''} ${v.last_name || ''}`.trim() || v.username;
          vendorMap[v.user_id] = name;
        });
      }
    } catch (e) {}
  }

  const selectedVendorId = (user && /^\d+$/.test(String(user))) ? String(user) : null;

  return (transactions || []).map(t => {
    const vendorIdVal = t.Vendor_ID || t.vendor_id;

    let userDisplay = 'Unknown User';
    let userRole = 'customer';

    if (selectedVendorId && vendorIdVal && String(vendorIdVal) === selectedVendorId) {
      userDisplay = vendorMap[selectedVendorId] || `Vendor #${selectedVendorId}`;
      userRole = 'vendor';
    } else if (t.users) {
      userDisplay = (`${t.users.first_name || ''} ${t.users.last_name || ''}`.trim() || t.users.username) || 'Unknown User';
      userRole = t.users?.role || 'customer';
    } else if (vendorIdVal) {
      userDisplay = vendorMap[String(vendorIdVal)] || `Vendor #${vendorIdVal}`;
      userRole = 'vendor';
    }

    // Normalize activity type casing for consistent display
    const activityTypeValue = t.transaction_type ? String(t.transaction_type).charAt(0).toUpperCase() + String(t.transaction_type).slice(1).toLowerCase() : 'Purchase';

    return {
      date_time: t.transaction_date,
      // Prefer full name, fallback to username
      user: userDisplay,
      user_full_name: t.users ? `${t.users.first_name || ''} ${t.users.last_name || ''}`.trim() : '',
      user_role: userRole,
      activity_type: activityTypeValue,
      details: t.products?.product_name ? `${t.products.product_name} (x${t.quantity})` : 'N/A',
      store_name: t.stores?.store_name || 'Unknown Store',
      amount: t.total || 0,
      points: t.points || 0,
      vendor: vendorIdVal ? (vendorMap[String(vendorIdVal)] || `Vendor #${vendorIdVal}`) : '',
      status: 'Completed'
    };
  });
}

// Unified filter endpoint handler
export const filterReports = async (req, res) => {
  try {
    const { startDate, endDate, store, user, customer, vendor, userType, activityType, transactionType, sortOrder } = req.body;
    
    if (req.path.includes('/sales/filter')) {
      const sales = await buildFilteredSales({ startDate, endDate, store, sortOrder });
      return res.json(sales);
    }
    
    if (req.path.includes('/transactions/filter')) {
      const transactions = await buildFilteredUserTransactions({ 
        startDate, endDate, user, customer, vendor, userType, transactionType, sortOrder, store 
      });
      return res.json(transactions);
    }
    
    if (req.path.includes('/activity/filter')) {
      const activity = await buildFilteredActivity({ 
        startDate, endDate, user, customer, vendor, activityType, sortOrder, store 
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
    // Allow optional role filter via query string, e.g. ?role=vendor
    const roleFilter = req.query.role;

    let builder = supabase
      .from('users')
      .select('user_id, username, first_name, last_name, role')
      .not('username', 'is', null);

    if (roleFilter) {
      // sanitize simple values: accept only 'vendor' or 'customer'
      const roleLower = String(roleFilter).toLowerCase();
      if (['vendor', 'customer'].includes(roleLower)) {
        builder = builder.eq('role', roleLower);
      }
    } else {
      // default: only include customer and vendor
      builder = builder.in('role', ['customer', 'vendor']);
    }

    const { data: users, error } = await builder.order('username');

    if (error) throw error;

    // Return richer user objects so the frontend can display full name
    const userList = users.map(u => ({
      user_id: u.user_id,
      username: u.username,
      first_name: u.first_name || '',
      last_name: u.last_name || ''
    }));

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
    // Support optional filtering by user role and user id so the frontend can
    // show stores related to a selected user (e.g. vendor-owned stores or
    // stores where a customer transacted).
    const role = req.query.role; // 'vendor' | 'customer'
    const user = req.query.user; // user id expected

    // If role=vendor and user provided, return stores owned by that vendor
    if (role && String(role).toLowerCase() === 'vendor' && user) {
      const { data: stores, error } = await supabase
        .from('stores')
        .select('store_id, store_name')
        .eq('owner_id', user)
        .eq('is_active', true)
        .order('store_name');

      if (error) throw error;
      return res.json((stores || []).map(s => ({ store_id: s.store_id, store_name: s.store_name })));
    }

    // If role=customer and user provided, return stores where this customer had transactions
    if (role && String(role).toLowerCase() === 'customer' && user) {
      // Fetch distinct store_ids from transactions for that user
      const { data: txs, error: txErr } = await supabase
        .from('transactions')
        .select('store_id')
        .eq('user_id', user);

      if (txErr) throw txErr;

      const storeIds = Array.from(new Set((txs || []).map(t => t.store_id).filter(Boolean)));
      if (storeIds.length === 0) return res.json([]);

      const { data: stores, error } = await supabase
        .from('stores')
        .select('store_id, store_name')
        .in('store_id', storeIds)
        .eq('is_active', true)
        .order('store_name');

      if (error) throw error;
      return res.json((stores || []).map(s => ({ store_id: s.store_id, store_name: s.store_name })));
    }

    // Default: return all active stores
    const { data: stores, error } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('is_active', true)
      .order('store_name');

    if (error) throw error;

    // Return as objects: [{ store_id, store_name }, ...]
    const storeList = stores.map(s => ({ store_id: s.store_id, store_name: s.store_name }));
    res.json(storeList);
  } catch (error) {
    console.error('Error fetching stores for filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Debug helper: return vendor-related transaction counts and samples
export const debugVendorData = async (req, res) => {
  try {
    const userId = req.query.user;
    if (!userId) return res.status(400).json({ error: 'user query param required' });

    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const transactionType = req.query.transactionType || null;

    // Query A: transactions by user
    const qA = getBaseTransactionsQuery();
    let qAa = applyDateRange(qA, 'transaction_date', startDate, endDate);
    if (transactionType) qAa = qAa.eq('transaction_type', transactionType);
    qAa = qAa.eq('user_id', userId).limit(5);
    const resA = await qAa;

    // Query C: transactions where Vendor_ID equals the user (vendor actor)
    const qC = getBaseTransactionsQuery();
    let qCc = applyDateRange(qC, 'transaction_date', startDate, endDate);
    if (transactionType) qCc = qCc.eq('transaction_type', transactionType);
    qCc = qCc.eq('Vendor_ID', userId).limit(5);
    const resC = await qCc;

    // Query B: transactions in stores owned by user
    const qB = getBaseTransactionsQuery();
    let qBb = applyDateRange(qB, 'transaction_date', startDate, endDate);
    if (transactionType) qBb = qBb.eq('transaction_type', transactionType);
    qBb = qBb.eq('stores.owner_id', userId).limit(5);
    const resB = await qBb;

    return res.json({
      user: userId,
      count_user_id: (resA && Array.isArray(resA.data)) ? resA.data.length : 0,
      count_vendor_id: (resC && Array.isArray(resC.data)) ? resC.data.length : 0,
      count_store_owned: (resB && Array.isArray(resB.data)) ? resB.data.length : 0,
      sample_user_id: (resA && resA.data) ? resA.data.slice(0,5) : [],
      sample_vendor_id: (resC && resC.data) ? resC.data.slice(0,5) : [],
      sample_store_owned: (resB && resB.data) ? resB.data.slice(0,5) : []
    });
  } catch (error) {
    console.error('Error in debugVendorData:', error);
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
    const { startDate, endDate, user, customer, vendor, transactionType, sortOrder, filename, store } = req.query;
    const transactions = await buildFilteredUserTransactions({ 
      startDate, endDate, user, customer, vendor, transactionType, sortOrder, store 
    });

    const safeName = (filename && String(filename).trim()) || 'transactions-report';
    setCsvHeaders(res, safeName);

    const header = ['Date', 'User', 'Transaction Type', 'Reference Number', 'Amount', 'Store', 'Vendor', 'Product Details'];
    const lines = [header.map(escapeCsv).join(',')].concat(
      transactions.map(row => [
        escapeCsv(formatDateMDY(row.date_time)),
        escapeCsv(row.user),
        escapeCsv(row.transaction_type),
        escapeCsv(row.transaction_id),
        escapeCsv(Number(row.amount).toFixed(2)),
        escapeCsv(row.store_name),
        escapeCsv(row.vendor || ''),
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
    const { startDate, endDate, user, customer, vendor, activityType, sortOrder, filename, store } = req.query;
    const activity = await buildFilteredActivity({ startDate, endDate, user, customer, vendor, activityType, sortOrder, store });

    const safeName = (filename && String(filename).trim()) || 'activity-report';
    setCsvHeaders(res, safeName);

    const header = ['Date', 'User', 'Activity Type', 'Details', 'Store', 'Vendor', 'Status'];
    const lines = [header.map(escapeCsv).join(',')].concat(
      activity.map(row => [
        escapeCsv(formatDateMDY(row.date_time)),
        escapeCsv(row.user || ''),
        escapeCsv(row.activity_type),
        escapeCsv(row.details),
        escapeCsv(row.store_name || ''),
        escapeCsv(row.vendor || ''),
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

    // Resolve store id -> name for a nicer filters summary when possible
    let resolvedStore = store;
    try {
      if (store && /^\d+$/.test(String(store))) {
        const { data: storeRow, error: storeErr } = await supabase
          .from('stores')
          .select('store_name')
          .eq('store_id', store)
          .maybeSingle();
        if (!storeErr && storeRow) resolvedStore = storeRow.store_name || resolvedStore;
      }
    } catch (e) {
      // ignore and fall back to raw store value
    }

    // Filters summary
    const filtersSummary = buildFiltersSummary({ startDate, endDate, store: resolvedStore, sortOrder }, formatDateMDY);
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
    const { startDate, endDate, user, customer, vendor, transactionType, sortOrder, filename, store } = req.query;
    const transactions = await buildFilteredUserTransactions({ 
      startDate, endDate, user, customer, vendor, transactionType, sortOrder, store 
    });

    const safeName = (filename && String(filename).trim()) || 'transactions-report';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('User Transaction Report', { align: 'center' });
    doc.moveDown(0.5);

    // Resolve store id -> name for PDF filters summary when possible
    let resolvedStore = store;
    try {
      if (store && /^\d+$/.test(String(store))) {
        const { data: storeRow, error: storeErr } = await supabase
          .from('stores')
          .select('store_name')
          .eq('store_id', store)
          .maybeSingle();
        if (!storeErr && storeRow) resolvedStore = storeRow.store_name || resolvedStore;
      }
    } catch (e) {}

    const filtersSummary = buildFiltersSummary({ startDate, endDate, user, transactionType, sortOrder, store: resolvedStore }, formatDateMDY);
    if (filtersSummary) {
      doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
      doc.moveDown(0.5);
    }
    doc.fillColor('#000');

    const headers = ['Date', 'User', 'Type', 'Reference #', 'Amount', 'Store', 'Vendor', 'Details'];
    const columnWidths = [70, 80, 60, 80, 50, 80, 60, 90];
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
        row.vendor || '',
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
    const { startDate, endDate, user, customer, vendor, activityType, sortOrder, filename, store } = req.query;
    const activity = await buildFilteredActivity({ startDate, endDate, user, customer, vendor, activityType, sortOrder, store });

    const safeName = (filename && String(filename).trim()) || 'activity-report';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('User Activity Report', { align: 'center' });
    doc.moveDown(0.5);

    // Resolve store id -> name for filters summary when possible
    let resolvedStore = store;
    try {
      if (store && /^\d+$/.test(String(store))) {
        const { data: storeRow, error: storeErr } = await supabase
          .from('stores')
          .select('store_name')
          .eq('store_id', store)
          .maybeSingle();
        if (!storeErr && storeRow) resolvedStore = storeRow.store_name || resolvedStore;
      }
    } catch (e) {}

    const filtersSummary = buildFiltersSummary({ startDate, endDate, user, activityType, sortOrder, store: resolvedStore }, formatDateMDY);
    if (filtersSummary) {
      doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
      doc.moveDown(0.5);
    }
    doc.fillColor('#000');

    const headers = ['Date', 'User', 'Activity', 'Details', 'Store', 'Vendor', 'Status'];
    const columnWidths = [70, 70, 70, 140, 90, 70, 60];
    const startX = doc.page.margins.left;
    const { drawRow } = createRowDrawer(doc, startX, columnWidths);

    drawRow(headers, true);
    activity.forEach(row => {
      drawRow([
        formatDateMDY(row.date_time),
        row.user || '',
        row.activity_type,
        row.details,
        row.store_name || '',
        row.vendor || '',
        row.status || 'Completed'
      ]);
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting activity PDF:', error);
    res.status(500).send('Failed to generate PDF');
  }
};
