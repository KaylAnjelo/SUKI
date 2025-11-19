// import express from "express";
// import supabase from "../../config/db.js";
// const router = express.Router();

// // Promotions API routes
// router.get('/promotions', async (req, res) => {
//   try {
//     const userId = req.session.userId;
    
//     if (!userId) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }

//     // Get promotions for the owner
//     const { data: promotions, error } = await supabase
//       .from('promotions')
//       .select('*')
//       .eq('owner_id', userId)
//       .order('created_at', { ascending: false });

//     if (error) {
//       console.error('Error fetching promotions:', error);
//       return res.status(500).json({ error: 'Failed to fetch promotions' });
//     }

//     res.json(promotions || []);
//   } catch (error) {
//     console.error('Error in GET /api/owner/promotions:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// // Top products endpoint for Owner Dashboard
// router.get('/top-products', async (req, res) => {
//   try {
//     const userId = req.session.userId;
//     const { category = 'all', limit = 5 } = req.query;

//     if (!userId) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }

//     // Fetch transaction items joined to transactions to filter by owner
//     const { data: items, error } = await supabase
//       .from('transaction_items')
//       .select('product_name, quantity, unit_price, transactions!inner(owner_id, transaction_id)')
//       .eq('transactions.owner_id', userId);

//     if (error) {
//       console.error('Error fetching top products:', error);
//       return res.status(500).json({ error: 'Failed to fetch top products' });
//     }

//     // Aggregate by product_name
//     const productMap = new Map();
//     (items || []).forEach((it) => {
//       const key = it.product_name || 'Unknown Product';
//       const existing = productMap.get(key) || { product_name: key, total_quantity: 0, total_revenue: 0, store_name: 'N/A' };
//       const qty = Number(it.quantity || 0);
//       const price = Number(it.unit_price || 0);
//       existing.total_quantity += qty;
//       existing.total_revenue += qty * price;
//       productMap.set(key, existing);
//     });

//     // Optional: filter by category if your schema has categories (placeholder - no-op)
//     let products = Array.from(productMap.values())
//       .sort((a, b) => b.total_quantity - a.total_quantity)
//       .slice(0, Number(limit));

//     const labels = products.map(p => p.product_name);
//     const data = products.map(p => p.total_quantity);
//     const backgroundColors = labels.map((_, i) => {
//       const hue = (i * 67) % 360;
//       return `hsl(${hue}, 70%, 60%)`;
//     });

//     return res.json({
//       labels,
//       data,
//       backgroundColors,
//       products,
//       category
//     });
//   } catch (err) {
//     console.error('Error in GET /api/owner/top-products:', err);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// });

// // Customer engagement endpoint for Owner Dashboard
// router.get('/customer-engagement', async (req, res) => {
//   try {
//     const userId = req.session.userId;
//     const { period = '30d' } = req.query; // '7d' | '30d' | '90d' | '1y'

//     if (!userId) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }

//     // Determine labels and bucket function
//     let labels = [];
//     const now = new Date();

//     function formatDate(d) {
//       return d.toISOString().slice(0, 10);
//     }

//     if (period === '7d' || period === '30d' || period === '90d') {
//       const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
//       for (let i = days - 1; i >= 0; i--) {
//         const d = new Date(now);
//         d.setDate(d.getDate() - i);
//         labels.push(formatDate(d));
//       }
//     } else if (period === '1y') {
//       // Last 12 months labels as YYYY-MM
//       for (let i = 11; i >= 0; i--) {
//         const d = new Date(now);
//         d.setMonth(d.getMonth() - i);
//         const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
//         labels.push(label);
//       }
//     }

//     // Fetch owner transactions
//     const { data: txns, error } = await supabase
//       .from('transactions')
//       .select('transaction_id, customer_id, points, transaction_date')
//       .eq('owner_id', userId)
//       .order('transaction_date', { ascending: true });

//     if (error) {
//       console.error('Error fetching engagement data:', error);
//       return res.status(500).json({ error: 'Failed to fetch engagement data' });
//     }

//     // Initialize series
//     const activeCustomersSeries = new Array(labels.length).fill(0);
//     const pointsEarnedSeries = new Array(labels.length).fill(0);
//     const totalTransactionsSeries = new Array(labels.length).fill(0);

//     // Helper to find label index
//     function findIndexByDate(dateStr) {
//       if (period === '1y') {
//         return labels.indexOf(dateStr.slice(0, 7));
//       }
//       return labels.indexOf(dateStr.slice(0, 10));
//     }

//     // Track unique customers per bucket
//     const uniqueCustomersPerBucket = labels.map(() => new Set());

//     (txns || []).forEach(t => {
//       const dateStr = (t.transaction_date instanceof Date)
//         ? t.transaction_date.toISOString()
//         : new Date(t.transaction_date).toISOString();
//       const idx = findIndexByDate(dateStr);
//       if (idx === -1) return;
//       totalTransactionsSeries[idx] += 1;
//       pointsEarnedSeries[idx] += Number(t.points || 0);
//       if (t.customer_id != null) {
//         uniqueCustomersPerBucket[idx].add(String(t.customer_id));
//       }
//     });

//     for (let i = 0; i < labels.length; i++) {
//       activeCustomersSeries[i] = uniqueCustomersPerBucket[i].size;
//     }

//     const datasets = [
//       {
//         label: 'Active Customers',
//         data: activeCustomersSeries,
//         borderColor: '#7c0f0f',
//         backgroundColor: 'rgba(124, 15, 15, 0.1)',
//         yAxisID: 'y'
//       },
//       {
//         label: 'Points Earned',
//         data: pointsEarnedSeries,
//         borderColor: '#2563eb',
//         backgroundColor: 'rgba(37, 99, 235, 0.1)',
//         yAxisID: 'y1'
//       },
//       {
//         label: 'Total Transactions',
//         data: totalTransactionsSeries,
//         borderColor: '#10b981',
//         backgroundColor: 'rgba(16, 185, 129, 0.1)',
//         yAxisID: 'y'
//       }
//     ];

//     const summary = {
//       totalCustomers: new Set((txns || []).map(t => t.customer_id)).size,
//       totalPoints: (txns || []).reduce((s, t) => s + Number(t.points || 0), 0),
//       totalTransactions: (txns || []).length,
//       avgPointsPerTransaction: ((txns || []).length ? ((txns || []).reduce((s, t) => s + Number(t.points || 0), 0) / (txns || []).length) : 0)
//     };

//     return res.json({ labels, datasets, period, summary });
//   } catch (err) {
//     console.error('Error in GET /api/owner/customer-engagement:', err);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// });

// // Recommendations endpoint for Owner Dashboard
// router.get('/recommendations', async (req, res) => {
//   try {
//     const userId = req.session.userId;

//     if (!userId) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }

//     // Fetch recent transactions as a proxy for data sufficiency
//     const { data: txns, error } = await supabase
//       .from('transactions')
//       .select('transaction_id, points, transaction_date')
//       .eq('owner_id', userId)
//       .order('transaction_date', { ascending: false })
//       .limit(200);

//     if (error) {
//       console.error('Error fetching transactions for recommendations:', error);
//       return res.status(500).json({ error: 'Failed to fetch recommendations' });
//     }

//     if (!txns || txns.length < 20) {
//       return res.json({ recommendations: [] });
//     }

//     // Simple heuristic-based recommendations (placeholder)
//     const totalPoints = txns.reduce((s, t) => s + Number(t.points || 0), 0);

//     const recommendations = [
//       {
//         title: 'Launch double points on slow days',
//         description: 'Points activity is lower mid-week. Offer 2x points on Wednesdays to boost traffic.',
//         action: 'Schedule mid-week 2x points promo for the next 4 weeks.',
//         type: 'promotional_strategy',
//         priority: 'medium'
//       },
//       {
//         title: 'Encourage higher basket size',
//         description: 'Average points per transaction suggests room to increase basket size with bundles.',
//         action: 'Create bundle offers that award bonus points above a ₱500 spend.',
//         type: 'product_optimization',
//         priority: 'low',
//         revenue: Math.max(0, totalPoints * 1.5)
//       }
//     ];

//     return res.json({ recommendations });
//   } catch (err) {
//     console.error('Error in GET /api/owner/recommendations:', err);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// });

// // Stores dropdown for Sales Report filter
// router.get('/stores/dropdown', async (req, res) => {
//   try {
//     const userId = req.session.userId;
//     if (!userId) {
//       return res.status(401).json([]);
//     }

//     const { data: stores, error } = await supabase
//       .from('stores')
//       .select('store_id, store_name')
//       .eq('owner_id', userId)
//       .order('store_name', { ascending: true });

//     if (error) {
//       console.error('Error fetching stores for dropdown:', error);
//       return res.status(500).json([]);
//     }

//     res.json(stores || []);
//   } catch (err) {
//     console.error('Error in GET /api/owner/stores/dropdown:', err);
//     res.status(500).json([]);
//   }
// });

// export default router;
