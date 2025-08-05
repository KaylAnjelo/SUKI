import supabase from '../../config/db.js';

// Helper
export function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

export const getReports = async (req, res) => {
    try {
        // Get all stores for the filter dropdown
        const { data: stores, error: storesError } = await supabase
            .from('stores')
            .select('store_name');
        if (storesError) throw storesError;

        // Get all transactions
        const { data: transactions, error: transactionsError } = await supabase
            .from('transactions')
            .select('id, transaction_date, store_id, reference_number');
        if (transactionsError) throw transactionsError;

        // Get all transaction_details
        const { data: details, error: detailsError } = await supabase
            .from('transaction_details')
            .select('transaction_id, product_id, quantity');
        if (detailsError) throw detailsError;

        // Get all products
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, product_name, price, store_id');
        if (productsError) throw productsError;

        // Loop through each transaction
        for (const transaction of transactions) {
        const productsFromStore = products.filter(p => p.store_id === transaction.store_id);
        
        // Skip if no product found
        if (productsFromStore.length === 0) continue;

        // Pick random product
        const randomProduct = productsFromStore[Math.floor(Math.random() * productsFromStore.length)];

        // Generate quantity
        const quantity = Math.floor(Math.random() * 3) + 1;

        // Insert into transaction_details
        await supabase.from('transaction_details').insert({
            transaction_id: transaction.id,
            product_id: randomProduct.id,
            quantity,
        });
        }
        // Get all stores (for store_name lookup)
        const { data: storesFull, error: storesFullError } = await supabase
            .from('stores')
            .select('owner_id, store_name');
        if (storesFullError) throw storesFullError;

        // Build sales data
        const sales = transactions.map(t => {
            const store = storesFull.find(s => s.owner_id === t.store_id);
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
                store_name: store ? store.store_name : '',
                reference_number: t.reference_number,
                products_sold: productsSold,
                total_amount: totalAmount
            };
        });

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
            salesTableRowsHtml = '<tr><td colspan="6">No sales data available.</td></tr>';
        }

        // Generate HTML for store filter options
        let storeFilterOptionsHtml = '<option value="">All Stores</option>';
        stores.forEach(store => {
            storeFilterOptionsHtml += `<option value="${store.store_name}">${store.store_name}</option>`;
        });

        // Render the sales page with the generated HTML
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

            // Get all transaction_details and products
            const { data: details, error: detailsError } = await supabase
                .from('transaction_details')
                .select('transaction_id, product_id, quantity');
            if (detailsError) throw detailsError;

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

        // You can apply a similar approach for /activity/filter and /transactions/filter
        // by fetching the relevant tables and filtering/sorting in JS.

        res.status(400).json({ error: 'Unsupported filter type' });
    } catch (error) {
        console.error('Error filtering reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
