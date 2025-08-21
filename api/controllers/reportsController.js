import supabase from '../../config/db.js';
import PDFDocument from 'pdfkit';
import { formatDate, formatDateMDY } from '../utils/date.js';
import { generateReferenceNumber } from '../utils/reference.js';
import { applyDateRange } from '../utils/query.js';
import { escapeCsv, setCsvHeaders } from '../utils/csv.js';
import { buildFiltersSummary, createRowDrawer } from '../utils/pdf.js';

export const getSalesWithTotals = async (req, res) => {
  try {
    const { store_id, date } = req.query;
    // Aggregate directly in Supabase
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        product_name,
        quantity,
        price,
        total
      `)
      .eq('store_id', store_id)
      .eq('transaction_date', date);

    if (error) throw error;

    // Only calculate totals if you don't store them in DB
    const totals = {
      totalQuantity: data.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
      totalAmount: data.reduce((sum, row) => sum + (Number(row.total) || ((Number(row.quantity) || 0) * (Number(row.price) || 0))), 0)
    };

    res.json({
      sales: data,
      totals
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// date helpers moved to utils/date.js

export const getReports = async (req, res) => {
    try {
        // 1. Get all stores for filter dropdown
        const { data: stores, error: storesError } = await supabase
            .from('stores')
            .select('owner_id,store_name');
        if (storesError) throw storesError;

        // 2. Get all transactions (now includes product details & total)
        const { data: transactions, error: transactionsError } = await supabase
            .from('transactions')
            .select('id, transaction_date, store_id, reference_number, product_name, quantity, total');
        if (transactionsError) throw transactionsError;

        // 4. Build sales data directly from transactions table
        const sales = transactions.map(t => {
            const store = stores.find(s => s.owner_id === t.store_id);
            return {
                transaction_date: t.transaction_date,
                store_name: store ? store.store_name : '',
                reference_number: t.reference_number,
                products_sold: t.product_name ? `${t.product_name} (x${t.quantity})` : 'N/A',
                total_amount: t.total || 0
            };
        });

        // 4b. Default sort: newest first
        sales.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

        // 5. Generate HTML table rows
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

        // 6. Store filter dropdown options
        let storeFilterOptionsHtml = '<option value="">All Stores</option>';
        stores.forEach(store => {
            storeFilterOptionsHtml += `<option value="${store.store_name}">${store.store_name}</option>`;
        });

        // 7. Render the page
        res.render('reports/sales', {
            title: 'Sales Reports',
            salesTableRows: salesTableRowsHtml,
            storeFilterOptions: storeFilterOptionsHtml,
            // Provide initial data for client-side pagination
            initialSalesData: JSON.stringify(sales)
        });

    } catch (error) {
        console.error('Error fetching sales reports:', error.stack);
        res.status(500).send('Internal Server Error');
    }
};

// Internal: build filtered sales dataset used by both API and exports
async function buildFilteredSales({ startDate, endDate, store, sortOrder }) {
    // 1) Base query
    let query = supabase
        .from('transactions')
        .select('id, transaction_date, store_id, reference_number, product_name, quantity, total');

    query = applyDateRange(query, 'transaction_date', startDate, endDate);

    const { data: transactions, error: transactionsError } = await query;
    if (transactionsError) throw transactionsError;

    // 2) Filter by store name (maps to owner_id)
    let filteredTransactions = transactions;
    if (store) {
        const { data: storeRows, error: storesError } = await supabase
            .from('stores')
            .select('owner_id, store_name')
            .eq('store_name', store);
        if (storesError) throw storesError;
        const storeIds = (storeRows || []).map(s => s.owner_id);
        filteredTransactions = transactions.filter(t => storeIds.includes(t.store_id));
    }

    // 3) Load store names for mapping
    const { data: storesFull, error: storesFullError } = await supabase
        .from('stores')
        .select('owner_id, store_name');
    if (storesFullError) throw storesFullError;

    // 4) Build sales rows
    const sales = filteredTransactions.map(t => {
        const storeObj = storesFull.find(s => s.owner_id === t.store_id);
        return {
            transaction_date: t.transaction_date,
            store_name: storeObj ? storeObj.store_name : '',
            reference_number: t.reference_number,
            products_sold: t.product_name ? `${t.product_name} (x${t.quantity})` : 'N/A',
            total_amount: t.total || 0
        };
    });

    // 5) Sort by date
    sales.sort((a, b) => {
        if (sortOrder === 'oldest') {
            return new Date(a.transaction_date) - new Date(b.transaction_date);
        }
        return new Date(b.transaction_date) - new Date(a.transaction_date);
    });

    return sales;
}

// reference helper centralized in utils/reference.js


// Add filter endpoint handler
export const filterReports = async (req, res) => {
    try {
        const { startDate, endDate, store, user, userType, activityType, transactionType, sortOrder } = req.body;
        if (req.path.includes('/sales/filter')) {
            console.log('FilterReports: sales');
            const sales = await buildFilteredSales({ startDate, endDate, store, sortOrder });
            res.json(sales);
            return;
        }
        if (req.path.includes('/transactions/filter')) {
            console.log('FilterReports: transactions');
            const transactions = await buildFilteredUserTransactions({ startDate, endDate, user, userType, transactionType, sortOrder });
            res.json(transactions);
            return;
        }
        if (req.path.includes('/activity/filter')) {
            console.log('FilterReports: activity');
            const activity = await buildFilteredActivity({ startDate, endDate, user, activityType, sortOrder });
            res.json(activity);
            return;
        }

        res.status(400).json({ error: 'Unsupported filter type' });
    } catch (error) {
        console.error('Error filtering reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Build transactions list for reports/transactions
async function buildFilteredUserTransactions({ startDate, endDate, user, userType, transactionType, sortOrder }) {
    // Fetch transactions without joins to avoid relational errors
    // Use broad selection to avoid errors when optional columns do not exist
    let query = supabase
        .from('transactions')
        .select('*');

    query = applyDateRange(query, 'transaction_date', startDate, endDate);

    const { data: rows, error } = await query;
    if (error) throw error;

    let baseRows = rows || [];
    // If filtering by userType, fetch matching user IDs first
    if (userType) {
        const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
        const desired = normalize(userType);
        const { data: allUsers } = await supabase
            .from('users')
            .select('id, user_id, user_type, role, type, category');
        const allowedIds = new Set();
        (allUsers || []).forEach(u => {
            const computed = u.user_type ?? u.role ?? u.type ?? u.category;
            if (normalize(computed) === desired) {
                allowedIds.add(u.user_id ?? u.id);
            }
        });
        baseRows = baseRows.filter(r => allowedIds.has(r.user_id));
    }

    const userIds = Array.from(new Set(baseRows.map(r => r.user_id).filter(Boolean)));
    const storeIds = Array.from(new Set(baseRows.map(r => r.store_id).filter(Boolean)));

    // Load usernames with fallback for schema (user_id vs id)
    let userIdToName = new Map();
    if (userIds.length > 0) {
        let usersRows = [];
        try {
            const res1 = await supabase
                .from('users')
                .select('user_id, username')
                .in('user_id', userIds);
            usersRows = res1.data || [];
            if (!usersRows.length) {
                const res2 = await supabase
                    .from('users')
                    .select('id, username')
                    .in('id', userIds);
                usersRows = res2.data || [];
                (usersRows || []).forEach(u => userIdToName.set(u.id, u.username));
            } else {
                (usersRows || []).forEach(u => userIdToName.set(u.user_id, u.username));
            }
        } catch (_) {
            // ignore lookup failures, fall back to Unknown User
        }
    }

    // Load store names; try owner_id then id
    let storeIdToName = new Map();
    if (storeIds.length > 0) {
        try {
            let storeRows = [];
            const res1 = await supabase
                .from('stores')
                .select('owner_id, store_name')
                .in('owner_id', storeIds);
            storeRows = res1.data || [];
            if (!storeRows.length) {
                const res2 = await supabase
                    .from('stores')
                    .select('id, store_name')
                    .in('id', storeIds);
                storeRows = res2.data || [];
                (storeRows || []).forEach(s => storeIdToName.set(s.id, s.store_name));
            } else {
                (storeRows || []).forEach(s => storeIdToName.set(s.owner_id, s.store_name));
            }
        } catch (_) {
            // ignore lookup failures, fall back to Unknown Store
        }
    }

    let mapped = baseRows.map(t => ({
        date_time: t.transaction_date,
        user: userIdToName.get(t.user_id) || 'Unknown User',
        transaction_type: (t.activity_type || t.transaction_type || 'Purchase'),
        transaction_id: t.reference_number,
        amount: t.total || 0,
        store_name: storeIdToName.get(t.store_id) || 'Unknown Store',
        product_details: t.product_name ? `${t.product_name} (x${t.quantity || 0})` : 'N/A',
        points: t.points || 0
    }));

    if (user) {
        mapped = mapped.filter(r => r.user === user);
    }
    if (transactionType) {
        const want = String(transactionType).toLowerCase();
        mapped = mapped.filter(r => r.transaction_type && r.transaction_type.toLowerCase() === want);
    }

    mapped.sort((a, b) => {
        if (sortOrder === 'oldest') return new Date(a.date_time) - new Date(b.date_time);
        return new Date(b.date_time) - new Date(a.date_time);
    });

    return mapped;
}

// Build activity list for reports/activity
async function buildFilteredActivity({ startDate, endDate, user, activityType, sortOrder }) {
    // Fetch activity rows from transactions without relying on relational joins
    let query = supabase
        .from('transactions')
        .select('*');

    query = applyDateRange(query, 'transaction_date', startDate, endDate);

    const { data: rows, error } = await query;
    if (error) throw error;

    // Lookup usernames by user_id
    const userIds = Array.from(new Set((rows || []).map(r => r.user_id).filter(Boolean)));
    let userIdToName = new Map();
    if (userIds.length > 0) {
        try {
            // Try users.user_id first, then fallback to users.id
            let usersRows = [];
            const res1 = await supabase
                .from('users')
                .select('user_id, username')
                .in('user_id', userIds);
            usersRows = res1.data || [];
            if (!usersRows.length) {
                const res2 = await supabase
                    .from('users')
                    .select('id, username')
                    .in('id', userIds);
                usersRows = res2.data || [];
                (usersRows || []).forEach(u => userIdToName.set(u.id, u.username));
            } else {
                (usersRows || []).forEach(u => userIdToName.set(u.user_id, u.username));
            }
        } catch (_) {
            // ignore lookup failures, leave Unknown User
        }
    }

    let mapped = (rows || []).map(t => ({
        date_time: t.transaction_date,
        user: userIdToName.get(t.user_id) || '',
        activity_type: (t.activity_type || t.transaction_type || 'Transaction'),
        details: t.product_name ? `${t.product_name} (x${t.quantity || 0})` : 'N/A',
        status: 'Completed',
    }));

    if (activityType) {
        const want = String(activityType).toLowerCase();
        mapped = mapped.filter(a => a.activity_type && a.activity_type.toLowerCase() === want);
    }
    if (user) {
        mapped = mapped.filter(a => a.user && a.user === user);
    }

    mapped.sort((a, b) => {
        if (sortOrder === 'oldest') return new Date(a.date_time) - new Date(b.date_time);
        return new Date(b.date_time) - new Date(a.date_time);
    });

    return mapped;
}

// CSV export for sales
export const exportSalesCsv = async (req, res) => {
    try {
        const { startDate, endDate, store, sortOrder, filename } = req.query;
        const sales = await buildFilteredSales({ startDate, endDate, store, sortOrder });

        const safeName = (filename && String(filename).trim()) || 'sales-report';
        setCsvHeaders(res, safeName);

        const header = ['Date', 'Store', 'Reference Number', 'Products Sold', 'Total Amount'];

        const lines = [header.map(escapeCsv).join(',')].concat(
            sales.map(row => [
                escapeCsv(row.transaction_date),
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

// PDF export for sales
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

        // Table header
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

// CSV export for transactions
export const exportTransactionsCsv = async (req, res) => {
    try {
        const { startDate, endDate, user, transactionType, sortOrder, filename } = req.query;
        const transactions = await buildFilteredUserTransactions({ startDate, endDate, user, transactionType, sortOrder });

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

// PDF export for transactions
export const exportTransactionsPdf = async (req, res) => {
    try {
        const { startDate, endDate, user, transactionType, sortOrder, filename } = req.query;
        const transactions = await buildFilteredUserTransactions({ startDate, endDate, user, transactionType, sortOrder });

        const safeName = (filename && String(filename).trim()) || 'transactions-report';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        doc.pipe(res);

        // Title
        doc.fontSize(16).text('User Transaction Report', { align: 'center' });
        doc.moveDown(0.5);

        // Filters summary
        const filtersSummary = buildFiltersSummary({ startDate, endDate, user, transactionType, sortOrder }, formatDateMDY);
        if (filtersSummary) {
            doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
            doc.moveDown(0.5);
        }
        doc.fillColor('#000');

        // Table header
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

// Users/stores for filter dropdowns (from deleted userTransactionsController)
export const getUsersForFilter = async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('username')
            .order('username');
        if (error) throw error;
        const userList = (users || []).map(u => u.username);
        res.json(userList);
    } catch (error) {
        console.error('Error fetching users for filter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStoresForFilter = async (req, res) => {
    try {
        const { data: stores, error } = await supabase
            .from('stores')
            .select('store_name')
            .order('store_name');
        if (error) throw error;
        const storeList = (stores || []).map(s => s.store_name);
        res.json(storeList);
    } catch (error) {
        console.error('Error fetching stores for filter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// CSV export for activity
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

// PDF export for activity
export const exportActivityPdf = async (req, res) => {
    try {
        const { startDate, endDate, user, activityType, sortOrder, filename } = req.query;
        const activity = await buildFilteredActivity({ startDate, endDate, user, activityType, sortOrder });

        const safeName = (filename && String(filename).trim()) || 'activity-report';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        doc.pipe(res);

        // Title
        doc.fontSize(16).text('User Activity Report', { align: 'center' });
        doc.moveDown(0.5);

        // Filters summary
        const filtersSummary = buildFiltersSummary({ startDate, endDate, user, activityType, sortOrder }, formatDateMDY);
        if (filtersSummary) {
            doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
            doc.moveDown(0.5);
        }
        doc.fillColor('#000');

        // Table header
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
