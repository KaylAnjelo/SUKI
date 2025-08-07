import supabase from '../../config/db.js';

export const getSalesWithTotals = async (req, res) => {
  try {
    const { store_id, date } = req.query;

    // Aggregate totals directly in Supabase
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        product_name,
        quantity,
        price
      `)
      .eq('store_id', store_id)
      .eq('transaction_date', date);

    if (error) throw error;

    const totals = data.reduce(
      (acc, item) => {
        acc.totalQuantity += Number(item.quantity) || 0;
        acc.totalAmount += (Number(item.quantity) || 0) * (Number(item.price) || 0);
        return acc;
      },
      { totalQuantity: 0, totalAmount: 0 }
    );

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

export const getReports = async (req, res) => {
    try {
        // 1. Get all stores for filter dropdown
        const { data: stores, error: storesError } = await supabase
            .from('stores')
            .select('store_name');
        if (storesError) throw storesError;

        // 2. Get all transactions (now includes product details & total)
        const { data: transactions, error: transactionsError } = await supabase
            .from('transactions')
            .select('id, transaction_date, store_id, reference_number, product_name, quantity, total');
        if (transactionsError) throw transactionsError;

        // 3. Get store info for store_name lookup
        const { data: storesFull, error: storesFullError } = await supabase
            .from('stores')
            .select('owner_id, store_name');
        if (storesFullError) throw storesFullError;

        // 4. Build sales data directly from transactions table
        const sales = transactions.map(t => {
            const store = storesFull.find(s => s.owner_id === t.store_id);
            return {
                transaction_date: t.transaction_date,
                store_name: store ? store.store_name : '',
                reference_number: t.reference_number,
                products_sold: t.product_name ? `${t.product_name} (x${t.quantity})` : 'N/A',
                total_amount: t.total || 0
            };
        });

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
            storeFilterOptions: storeFilterOptionsHtml
        });

    } catch (error) {
        console.error('Error fetching sales reports:', error.stack);
        res.status(500).send('Internal Server Error');
    }
};

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
        // Example for /sales/filter
        if (req.path.includes('/sales/filter')) {
            // Fetch and filter transactions
            let query = supabase
                .from('transactions')
                .select('id, transaction_date, store_id, reference_number');

            if (startDate) query = query.gte('transaction_date', startDate);
            if (endDate) query = query.lte('transaction_date', endDate);

            const { data: transactions, error: transactionsError } = await query;
            if (transactionsError) throw transactionsError;

            // Filter by store if needed
            let filteredTransactions = transactions;
            if (store) {
                const { data: stores, error: storesError } = await supabase
                    .from('stores')
                    .select('owner_id, store_name')
                    .eq('store_name', store);
                if (storesError) throw storesError;
                const storeIds = stores.map(s => s.owner_id);
                filteredTransactions = transactions.filter(t => storeIds.includes(t.store_id));
            }

            const { data: products, error: productsError } = await supabase
                .from('products')
                .select('id, product_name, price');
            if (productsError) throw productsError;

            const { data: storesFull, error: storesFullError } = await supabase
                .from('stores')
                .select('owner_id, store_name');
            if (storesFullError) throw storesFullError;

            // Build sales data
            const sales = filteredTransactions.map(t => {
                const storeObj = storesFull.find(s => s.owner_id === t.store_id);
                const tDetails = details.filter(d => d.transaction_id === t.id);
                const productsSold = tDetails.map(d => {
                    const product = products.find(p => p.id === d.product_id);
                    return product ? product.product_name : '';
                }).join(', ');
                const totalAmount = tDetails.reduce((sum, d) => {
                    const product = products.find(p => p.id === d.product_id);
                    return sum + (product ? d.quantity * product.price : 0);
                }, 0);
                return {
                    transaction_date: t.transaction_date,
                    store_name: storeObj ? storeObj.store_name : '',
                    reference_number: t.reference_number,
                    products_sold: productsSold,
                    total_amount: totalAmount
                };
            });

            // Sort
            sales.sort((a, b) => {
                if (sortOrder === 'oldest') {
                    return new Date(a.transaction_date) - new Date(b.transaction_date);
                } else {
                    return new Date(b.transaction_date) - new Date(a.transaction_date);
                }
            });

            res.json(sales);
            return;
        }

        res.status(400).json({ error: 'Unsupported filter type' });
    } catch (error) {
        console.error('Error filtering reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
