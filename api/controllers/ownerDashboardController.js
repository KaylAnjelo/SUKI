import supabase from '../../config/db.js';

export const getOwnerDashboard = async (req, res) => {
  try {
    const { user } = req.session;

    if (!user) {
      return res.redirect('/login');
    }

    // Fetch the stores owned by the logged-in user
    const { data: stores, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', user.id);

    if (storeError) throw storeError;

    // Fetch all transactions linked to these stores
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .in('store_id', stores.map(s => s.store_id));

    if (txError) throw txError;

    // Compute total sales
    const totalSales = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    // Render your HBS file
    res.render('OwnerSide/ownerDashboard', {
      title: 'Owner Dashboard',
      user,
      stores,
      totalSales,
    });

  } catch (err) {
    console.error('❌ Error loading dashboard:', err.message);
    res.status(500).render('OwnerSide/ownerDashboard', {
      title: 'Owner Dashboard',
      error: 'Failed to load dashboard data.',
    });
  }
};

// Helper: return numeric store ids owned by user (empty array if none)
async function fetchOwnedStoreIds(userId) {
  const { data: stores, error } = await supabase
    .from('stores')
    .select('store_id')
    .eq('owner_id', userId);

  if (error) throw error;
  return (stores || []).map(s => Number(s.store_id)).filter(Boolean);
}

export const getTopProducts = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { category = 'all', limit = 5 } = req.query;
    const storeIds = await fetchOwnedStoreIds(userId);
    if (storeIds.length === 0) return res.json({ items: [] });

    // Fetch relevant transactions with joined product info
    const { data: txs, error } = await supabase
      .from('transactions')
      .select('product_id, quantity, total, products:product_id(id, product_name, product_type, product_image)')
      .in('store_id', storeIds)
      .limit(20000); // fetch reasonable cap

    if (error) throw error;

    // Aggregate in JS (safe and flexible)
    const stats = new Map();
    (txs || []).forEach(t => {
      const pid = Number(t.product_id);
      const prod = t.products || {};
      if (!stats.has(pid)) stats.set(pid, { 
        product_id: pid, 
        product_name: prod.product_name || String(pid), 
        product_type: prod.product_type || null,
        product_image: prod.product_image || null,
        total_sales: 0, 
        total_quantity: 0 
      });
      const s = stats.get(pid);
      s.total_sales += Number(t.total || 0);
      s.total_quantity += Number(t.quantity || 0);
    });

    let items = Array.from(stats.values());

    // optional category filter
    if (category && category !== 'all') {
      items = items.filter(it => String(it.product_type || '').toLowerCase() === String(category).toLowerCase());
    }

    items.sort((a, b) => b.total_sales - a.total_sales);
    items = items.slice(0, Math.max(0, parseInt(limit, 10) || 5));

    return res.json({ items });
  } catch (err) {
    console.error('getTopProducts error', err);
    return res.status(200).json({ items: [] });
  }
};

export const getSalesSummary = async (req, res) => {
  try {
    console.log('GET /sales-summary query:', req.query, 'user:', req.session?.user ?? req.session?.userId);
    const { user } = req.session;
    console.log("📊 [SalesSummary] Session user:", user);

    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Optional time window in days (defaults to 30)
    const days = Math.max(1, parseInt(req.query.days ?? '30', 10) || 30);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const { data: stores, error: storeError } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", user.id);

    console.log("📊 [SalesSummary] Stores:", stores);

    if (storeError) throw storeError;
    if (!stores.length) {
      console.log("⚠️ [SalesSummary] No stores found.");
      return res.json({ totalSales: 0, totalTransactions: 0 });
    }

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("total, transaction_date")
      .in("store_id", stores.map(s => s.store_id))
      .gte('transaction_date', start.toISOString())
      .lte('transaction_date', end.toISOString());

    console.log("📊 [SalesSummary] Transactions:", transactions?.length);

    if (txError) throw txError;

    const totalSales = transactions.reduce((sum, t) => sum + parseFloat(t.total || 0), 0);
    const totalTransactions = transactions.length;
    const avgOrderValue = totalTransactions > 0 ? (totalSales / totalTransactions) : 0;

    console.log("✅ [SalesSummary] Total sales:", totalSales, "Transactions:", totalTransactions);

    const payload = { totalSales, totalOrders: totalTransactions, avgOrderValue, days };
    console.log('Sales summary payload:', payload);
    return res.json(payload);
  } catch (err) {
    console.error('getSalesSummary error:', err && err.stack ? err.stack : err);
    // return safe zeroed summary
    return res.status(200).json({ totalSales: 0, totalOrders: 0, avgOrderValue: 0, days: parseInt(req?.query?.days || '30', 10) || 30 });
  }
};


/**
 * API: Get Customer Engagement
 */
export const getCustomerEngagement = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { period = '30d' } = req.query;
    // simple 30-day default, adjust as needed
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    // fetch store ids owned by user
    const { data: stores, error: storeErr } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storeErr) throw storeErr;
    const storeIds = (stores || []).map(s => s.store_id);
    if (!storeIds.length) return res.json({ labels: [], datasets: [{ data: [] }], summary: { totalCustomers:0, totalVisits:0, totalPoints:0 } });

    const { data: txs, error: txErr } = await supabase
      .from('transactions')
      .select('user_id, transaction_date, points')
      .in('store_id', storeIds)
      .gte('transaction_date', start.toISOString())
      .lte('transaction_date', end.toISOString())
      .order('transaction_date', { ascending: true });

    if (txErr) throw txErr;

    // build daily buckets
    const labels = [];
    const map = {};
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0,10);
      labels.push(key);
      map[key] = 0;
    }

    const unique = new Set();
    let totalVisits = 0, totalPoints = 0;
    (txs || []).forEach(t => {
      if (!t || !t.transaction_date) return;
      const key = new Date(t.transaction_date).toISOString().slice(0,10);
      if (map[key] !== undefined) map[key] += 1;
      totalVisits += 1;
      if (t.user_id) unique.add(String(t.user_id));
      totalPoints += Number(t.points || 0);
    });

    const dataSeries = labels.map(l => map[l] || 0);

    return res.json({
      labels: labels.map(l => (new Date(l + 'T00:00:00')).toLocaleDateString(undefined, { month:'short', day:'2-digit' })),
      datasets: [{ label: 'Customer Visits', data: dataSeries }],
      summary: { totalCustomers: unique.size, totalVisits, totalPoints }
    });
  } catch (err) {
    console.error('getCustomerEngagement error', err);
    return res.status(500).json({ error: 'Failed to fetch engagement' });
  }
};


/**
 * API: Get Recommendations
 */
export const getRecommendations = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const storeIds = await fetchOwnedStoreIds(userId);
    if (storeIds.length === 0) return res.json({ recommendations: [] });

    // Fetch recent transactions with reference_number so we can compute co-occurrence
    const { data: txs, error } = await supabase
      .from('transactions')
      .select('product_id, reference_number, quantity, products:product_id(id, product_name, product_type)')
      .in('store_id', storeIds)
      .order('transaction_date', { ascending: false })
      .limit(5000);

    if (error) throw error;

    // Build product co-occurrence by reference_number
    const byRef = new Map();
    (txs || []).forEach(t => {
      const ref = t.reference_number || (`ref:${Math.floor(Math.random()*10000000)}`);
      if (!byRef.has(ref)) byRef.set(ref, new Set());
      byRef.get(ref).add(Number(t.product_id));
    });

    const cooccur = new Map();
    for (const set of byRef.values()) {
      const items = Array.from(set);
      for (let i = 0; i < items.length; i++) {
        for (let j = 0; j < items.length; j++) {
          if (i === j) continue;
          const a = items[i], b = items[j];
          const key = `${a}::${b}`;
          cooccur.set(key, (cooccur.get(key) || 0) + 1);
        }
      }
    }

    // Compute global product popularity (fallback)
    const popularity = new Map();
    (txs || []).forEach(t => {
      const pid = Number(t.product_id);
      popularity.set(pid, (popularity.get(pid) || 0) + Number(t.quantity || 1));
    });

    // Build recommendations list: for each top product, pick most co-occurred products
    const topProducts = Array.from(popularity.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10).map(([pid]) => pid);

    const recs = [];
    for (const pid of topProducts) {
      // find co-occurring products with pid
      const co = Array.from(cooccur.entries())
        .filter(([k]) => k.startsWith(`${pid}::`))
        .map(([k,v]) => ({ otherId: Number(k.split('::')[1]), score: v }))
        .sort((a,b) => b.score - a.score)
        .slice(0,3)
        .map(c => c.otherId);
      recs.push({ product_id: pid, recommended_with: co });
    }

    // Resolve product names for ids used
    const allIds = Array.from(new Set([].concat(...recs.map(r => [r.product_id, ...(r.recommended_with || [])]))));
    if (allIds.length) {
      const { data: prods } = await supabase
        .from('products')
        .select('id, product_name, product_type')
        .in('id', allIds);

      const prodMap = new Map((prods || []).map(p => [Number(p.id), p]));
      const formatted = recs.map(r => ({
        product_id: r.product_id,
        product_name: prodMap.get(r.product_id)?.product_name || String(r.product_id),
        recommended: (r.recommended_with || []).map(id => ({
          product_id: id,
          product_name: prodMap.get(id)?.product_name || String(id)
        }))
      }));

      return res.json({ recommendations: formatted });
    }

    return res.json({ recommendations: [] });
  } catch (err) {
    console.error('getRecommendations error', err);
    return res.status(200).json({ recommendations: [] });
  }
};

/**
 * API: Get Order Rate (orders per day within a period)
 */
export const getOrderRate = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const storeIds = await fetchOwnedStoreIds(userId);
    if (!storeIds.length) return res.json({ labels: [], datasets: [{ data: [] }], summary: { totalOrders:0, avgPerDay:0 } });

    const { data: txs, error } = await supabase
      .from('transactions')
      .select('transaction_date')
      .in('store_id', storeIds)
      .gte('transaction_date', start.toISOString())
      .lte('transaction_date', end.toISOString())
      .order('transaction_date', { ascending: true });
    if (error) throw error;

    const labels = [];
    const map = {};
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0,10);
      labels.push(key);
      map[key] = 0;
    }
    (txs || []).forEach(t => {
      if (!t || !t.transaction_date) return;
      const key = new Date(t.transaction_date).toISOString().slice(0,10);
      if (map[key] !== undefined) map[key] += 1;
    });
    const dataSeries = labels.map(l => map[l] || 0);
    const totalOrders = dataSeries.reduce((a,b)=>a+b,0);
    const avgPerDay = days > 0 ? totalOrders / days : 0;

    return res.json({
      labels: labels.map(l => (new Date(l + 'T00:00:00')).toLocaleDateString(undefined, { month:'short', day:'2-digit' })),
      datasets: [{ label: 'Orders per day', data: dataSeries }],
      summary: { totalOrders, avgPerDay }
    });
  } catch (err) {
    console.error('getOrderRate error', err);
    return res.status(500).json({ error: 'Failed to fetch order rate' });
  }
};
