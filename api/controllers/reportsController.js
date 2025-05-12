const db = require('../../config/db');

// Helper
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

exports.getReports = async (req, res) => {
    try {
        // Get all stores for the filter dropdown
        const storesResult = await db.query('SELECT store_name FROM stores');
        const stores = storesResult.rows;

        // Build the main sales query
        const salesQuery = `
                SELECT 
                    t.transaction_date,
                    s.store_name,
                    t.reference_number,
                    STRING_AGG(p.product_name, ', ') AS products_sold,
                    SUM(td.quantity * p.price) AS total_amount,
                    t.status
                FROM transactions t
                JOIN stores s ON t.store_id = s.owner_id
                JOIN transaction_details td ON t.id = td.transaction_id
                JOIN products p ON td.product_id = p.id
                GROUP BY t.id, t.transaction_date, s.store_name, t.reference_number, t.status
                ORDER BY t.transaction_date DESC
            `;
        const salesResult = await db.query(salesQuery);
        const sales = salesResult.rows;
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
                        <td><span class="status-badge ${sale.status.toLowerCase()}">${sale.status}</span></td>
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

// Add filter endpoint handler
exports.filterReports = async (req, res) => {
    try {
        const { startDate, endDate, store, user, activityType, transactionType, sortOrder } = req.body;
        
        // Base query parts
        let query = '';
        let params = [];
        let paramIndex = 1;

        // Determine which report type we're handling
        if (req.path.includes('/sales/filter')) {
            query = `
                SELECT 
                    t.transaction_date,
                    s.store_name,
                    t.reference_number,
                    STRING_AGG(p.product_name, ', ') AS products_sold,
                    SUM(td.quantity * p.price) AS total_amount,
                    t.status
                FROM transactions t
                JOIN stores s ON t.store_id = s.owner_id
                JOIN transaction_details td ON t.id = td.transaction_id
                JOIN products p ON td.product_id = p.id
                WHERE 1=1
            `;

            if (startDate) {
                query += ` AND t.transaction_date >= $${paramIndex}`;
                params.push(startDate);
                paramIndex++;
            }
            if (endDate) {
                query += ` AND t.transaction_date <= $${paramIndex}`;
                params.push(endDate);
                paramIndex++;
            }
            if (store) {
                query += ` AND s.store_name = $${paramIndex}`;
                params.push(store);
                paramIndex++;
            }

            query += ` GROUP BY t.id, t.transaction_date, s.store_name, t.reference_number, t.status`;

            // Add sorting
            if (sortOrder === 'oldest') {
                query += ' ORDER BY t.transaction_date ASC';
            } else {
                query += ' ORDER BY t.transaction_date DESC';
            }

        } else if (req.path.includes('/activity/filter')) {
            query = `
                SELECT 
                    date_time,
                    user_name as user,
                    activity_type,
                    details,
                    status
                FROM user_activity
                WHERE 1=1
            `;

            if (startDate) {
                query += ` AND date_time >= $${paramIndex}`;
                params.push(startDate);
                paramIndex++;
            }
            if (endDate) {
                query += ` AND date_time <= $${paramIndex}`;
                params.push(endDate);
                paramIndex++;
            }
            if (user) {
                query += ` AND user_name = $${paramIndex}`;
                params.push(user);
                paramIndex++;
            }
            if (activityType) {
                query += ` AND activity_type = $${paramIndex}`;
                params.push(activityType);
                paramIndex++;
            }

            // Add sorting
            if (sortOrder === 'oldest') {
                query += ' ORDER BY date_time ASC';
            } else {
                query += ' ORDER BY date_time DESC';
            }

        } else if (req.path.includes('/transactions/filter')) {
            query = `
                SELECT 
                    transaction_date as date_time,
                    user_name as user,
                    transaction_type,
                    reference_number as transaction_id,
                    amount,
                    status
                FROM transactions
                WHERE 1=1
            `;

            if (startDate) {
                query += ` AND transaction_date >= $${paramIndex}`;
                params.push(startDate);
                paramIndex++;
            }
            if (endDate) {
                query += ` AND transaction_date <= $${paramIndex}`;
                params.push(endDate);
                paramIndex++;
            }
            if (user) {
                query += ` AND user_name = $${paramIndex}`;
                params.push(user);
                paramIndex++;
            }
            if (transactionType) {
                query += ` AND transaction_type = $${paramIndex}`;
                params.push(transactionType);
                paramIndex++;
            }

            // Add sorting
            if (sortOrder === 'oldest') {
                query += ' ORDER BY transaction_date ASC';
            } else {
                query += ' ORDER BY transaction_date DESC';
            }
        }

        const result = await db.query(query, params);
        res.json(result.rows);

    } catch (error) {
        console.error('Error filtering reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};