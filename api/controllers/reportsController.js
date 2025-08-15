import supabase from '../../config/db.js';
import PDFDocument from 'pdfkit';

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

// Helper
export function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatDateMDY(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

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

    if (startDate) query = query.gte('transaction_date', startDate);
    if (endDate) query = query.lte('transaction_date', endDate);

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

function generateRefNo(date, storeName) {
  const datePart = new Date(date).toISOString().slice(0, 10).replace(/-/g, '');
  const storePart = storeName.replace(/\s+/g, '').toUpperCase().slice(0, 4);
  const random = Math.floor(1000 + Math.random() * 9000); // random 4-digit
  return `${storePart}-${datePart}-${random}`;
}


// Add filter endpoint handler
export const filterReports = async (req, res) => {
    try {
        const { startDate, endDate, store, user, activityType, transactionType, sortOrder } = req.body;
        if (req.path.includes('/sales/filter')) {
            const sales = await buildFilteredSales({ startDate, endDate, store, sortOrder });
            res.json(sales);
            return;
        }
        if (req.path.includes('/transactions/filter')) {
            const transactions = await buildFilteredUserTransactions({ startDate, endDate, user, transactionType, sortOrder });
            res.json(transactions);
            return;
        }
        if (req.path.includes('/activity/filter')) {
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
async function buildFilteredUserTransactions({ startDate, endDate, user, transactionType, sortOrder }) {
    let query = supabase
        .from('transactions')
        .select(`
            id, 
            transaction_date, 
            reference_number, 
            total, 
            transaction_type,
            product_name, 
            quantity,
            store_id,
            users(username),
            stores(store_name)
        `);

    if (startDate) query = query.gte('transaction_date', startDate);
    if (endDate) query = query.lte('transaction_date', endDate);

    const { data: rows, error } = await query;
    if (error) throw error;

    // TODO: apply user/transactionType filters when schema supports them

    const mapped = (rows || []).map(t => ({
        date_time: t.transaction_date,
        user: t.users?.username || 'Unknown User',
        transaction_type: t.transaction_type || 'Purchase',
        transaction_id: t.reference_number,
        amount: t.total || 0,
        store_name: t.stores?.store_name || 'Unknown Store',
        product_details: t.product_name ? `${t.product_name} (x${t.quantity || 0})` : 'N/A'
    }));

    mapped.sort((a, b) => {
        if (sortOrder === 'oldest') return new Date(a.date_time) - new Date(b.date_time);
        return new Date(b.date_time) - new Date(a.date_time);
    });

    return mapped;
}

// Build activity list for reports/activity
async function buildFilteredActivity({ startDate, endDate, user, activityType, sortOrder }) {
    // For now, derive activity from transactions table
    let query = supabase
        .from('transactions')
        .select('id, transaction_date, product_name, quantity');

    if (startDate) query = query.gte('transaction_date', startDate);
    if (endDate) query = query.lte('transaction_date', endDate);

    const { data: rows, error } = await query;
    if (error) throw error;

    const mapped = (rows || []).map(t => ({
        date_time: t.transaction_date,
        user: '',
        activity_type: 'Transaction',
        details: t.product_name ? `${t.product_name} (x${t.quantity || 0})` : 'N/A',
        status: 'Completed',
    }));

    // Optional filtering by activityType
    const filtered = activityType ? mapped.filter(a => a.activity_type.toLowerCase() === String(activityType).toLowerCase()) : mapped;

    filtered.sort((a, b) => {
        if (sortOrder === 'oldest') return new Date(a.date_time) - new Date(b.date_time);
        return new Date(b.date_time) - new Date(a.date_time);
    });

    return filtered;
}

// CSV export for sales
export const exportSalesCsv = async (req, res) => {
    try {
        const { startDate, endDate, store, sortOrder, filename } = req.query;
        const sales = await buildFilteredSales({ startDate, endDate, store, sortOrder });

        const safeName = (filename && String(filename).trim()) || 'sales-report';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);

        const header = ['Date', 'Store', 'Reference Number', 'Products Sold', 'Total Amount'];
        const escapeCsv = (val) => {
            const s = String(val ?? '');
            const needsQuote = /[",\n]/.test(s);
            const escaped = s.replace(/"/g, '""');
            return needsQuote ? `"${escaped}"` : escaped;
        };

        const lines = [header.map(escapeCsv).join(',')].concat(
            sales.map(row => [
                escapeCsv(row.transaction_date),
                escapeCsv(row.store_name),
                escapeCsv(row.reference_number),
                escapeCsv(row.products_sold),
                escapeCsv(Number(row.total_amount).toFixed(2))
            ].join(','))
        );

        // UTF-8 BOM for Excel compatibility
        res.write('\uFEFF');
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
        const filtersSummary = [
            startDate ? `Start: ${formatDateMDY(startDate)}` : null,
            endDate ? `End: ${formatDateMDY(endDate)}` : null,
            store ? `Store: ${store}` : null,
            sortOrder ? `Sort: ${sortOrder}` : null
        ].filter(Boolean).join(' | ');
        if (filtersSummary) {
            doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
            doc.moveDown(0.5);
        }
        doc.fillColor('#000');

        // Table header
        const headers = ['Date', 'Store', 'Reference #', 'Products Sold', 'Total'];
        const columnWidths = [90, 100, 100, 180, 60];
        const startX = doc.page.margins.left;
        let y = doc.y + 10;

        const drawRow = (cells, bold = false) => {
            let x = startX;
            cells.forEach((text, idx) => {
                if (bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
                doc.fontSize(8).text(String(text ?? ''), x, y, { width: columnWidths[idx], continued: false });
                x += columnWidths[idx];
            });
            y += 18;
            if (y > doc.page.height - doc.page.margins.bottom - 40) {
                doc.addPage();
                y = doc.page.margins.top;
            }
        };

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
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);

        const header = ['Date', 'User', 'Transaction Type', 'Reference Number', 'Amount', 'Store', 'Product Details'];
        const escapeCsv = (val) => {
            const s = String(val ?? '');
            const needsQuote = /[",\n]/.test(s);
            const escaped = s.replace(/"/g, '""');
            return needsQuote ? `"${escaped}"` : escaped;
        };

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

        // UTF-8 BOM for Excel compatibility
        res.write('\uFEFF');
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
        const filtersSummary = [
            startDate ? `Start: ${formatDateMDY(startDate)}` : null,
            endDate ? `End: ${formatDateMDY(endDate)}` : null,
            user ? `User: ${user}` : null,
            transactionType ? `Type: ${transactionType}` : null,
            sortOrder ? `Sort: ${sortOrder}` : null
        ].filter(Boolean).join(' | ');
        if (filtersSummary) {
            doc.fontSize(8).fillColor('#555').text(filtersSummary, { align: 'center' });
            doc.moveDown(0.5);
        }
        doc.fillColor('#000');

        // Table header
        const headers = ['Date', 'User', 'Type', 'Reference #', 'Amount', 'Store', 'Details'];
        const columnWidths = [70, 60, 60, 80, 50, 80, 120];
        const startX = doc.page.margins.left;
        let y = doc.y + 10;

        const drawRow = (cells, bold = false) => {
            let x = startX;
            cells.forEach((text, idx) => {
                if (bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
                doc.fontSize(8).text(String(text ?? ''), x, y, { width: columnWidths[idx], continued: false });
                x += columnWidths[idx];
            });
            y += 18;
            if (y > doc.page.height - doc.page.margins.bottom - 40) {
                doc.addPage();
                y = doc.page.margins.top;
            }
        };

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
