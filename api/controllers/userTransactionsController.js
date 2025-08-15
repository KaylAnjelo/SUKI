import supabase from '../../config/db.js';

// Helper function to format dates
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

// Get all user transactions with user and store information
export const getUserTransactions = async (req, res) => {
    try {
        // Fetch transactions with joined user and store data
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select(`
                id,
                transaction_date,
                reference_number,
                total,
                product_name,
                quantity,
                points,
                users(username, email),
                stores(store_name, location)
            `)
            .order('transaction_date', { ascending: false });

        if (error) throw error;

        // Transform the data for display
        const transformedTransactions = (transactions || []).map(t => ({
            id: t.id,
            date: formatDate(t.transaction_date),
            user: t.users?.username || 'Unknown User',
            transaction_type: t.points ? 'Points Transaction' : 'Purchase',
            reference_number: t.reference_number || 'N/A',
            amount: t.total || 0,
            store: t.stores?.store_name || 'Unknown Store',
            product_details: t.product_name ? `${t.product_name} (x${t.quantity || 0})` : 'N/A',
            points: t.points || 0
        }));

        // Render the page with initial data
        res.render('reports/transactions', {
            title: 'User Transaction Reports',
            transactions: transformedTransactions,
            initialData: JSON.stringify(transformedTransactions)
        });

    } catch (error) {
        console.error('Error fetching user transactions:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Filter transactions based on criteria
export const filterUserTransactions = async (req, res) => {
    try {
        const { startDate, endDate, user, transactionType, sortOrder } = req.body;

        // Build the base query
        let query = supabase
            .from('transactions')
            .select(`
                id,
                transaction_date,
                reference_number,
                total,
                product_name,
                quantity,
                points,
                users(username, email),
                stores(store_name, location)
            `);

        // Apply date filters
        if (startDate) query = query.gte('transaction_date', startDate);
        if (endDate) query = query.lte('transaction_date', endDate);

        // Apply user filter if specified
        if (user) {
            query = query.eq('users.username', user);
        }

        // Apply transaction type filter
        if (transactionType) {
            if (transactionType === 'purchase') {
                query = query.is('points', null);
            } else if (transactionType === 'redemption') {
                query = query.gt('points', 0);
            }
        }

        // Apply sorting
        if (sortOrder === 'oldest') {
            query = query.order('transaction_date', { ascending: true });
        } else {
            query = query.order('transaction_date', { ascending: false });
        }

        const { data: transactions, error } = await query;
        if (error) throw error;

        // Transform the filtered data
        const filteredTransactions = (transactions || []).map(t => ({
            id: t.id,
            date: formatDate(t.transaction_date),
            user: t.users?.username || 'Unknown User',
            transaction_type: t.points ? 'Points Transaction' : 'Purchase',
            reference_number: t.reference_number || 'N/A',
            amount: t.total || 0,
            store: t.stores?.store_name || 'Unknown Store',
            product_details: t.product_name ? `${t.product_name} (x${t.quantity || 0})` : 'N/A',
            points: t.points || 0
        }));

        res.json(filteredTransactions);

    } catch (error) {
        console.error('Error filtering user transactions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get unique users for filter dropdown
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

// Get unique stores for filter dropdown
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
