// services/reportService.js
import supabase from '../../config/db.js'; // your supabase client instance
import { subDays, formatISO, startOfDay, endOfDay } from 'date-fns';

// Helper to generate colors
const COLORS = [
  '#7c0f0f','#059669','#f59e0b','#06b6d4','#8b5cf6','#ef4444','#10b981','#f97316'
];
function colorFor(i){ return COLORS[i % COLORS.length]; }

/**
 * fetchTopProducts
 * - ownerId: only products in stores that the owner owns
 * - category: optional ('all' -> no filter)
 * - limit: top N by quantity
 */
export async function fetchTopProducts({ ownerId, category = 'all', limit = 5 }) {
  // 1) get store ids owned by owner
  const { data: stores, error: sErr } = await supabase
    .from('stores')
    .select('store_id,store_name')
    .eq('owner_id', ownerId)
    .eq('is_active', true);

  if (sErr) throw sErr;
  const storeIds = (stores || []).map(s => s.store_id);
  if (!storeIds.length) {
    return { labels: [], data: [], backgroundColors: [], products: [], category, totalRevenue: 0, totalQuantity: 0 };
  }

  // 2) aggregate transactions by product_id for those stores (last 90 days by default)
  const since = formatISO(subDays(new Date(), 90));
  // Use RPC or SQL if needed, but supabase select with foreign table join works as in your other code:
  const { data: rows, error } = await supabase
    .from('transactions')
    .select(`
      product_id,
      sum_quantity:quantity,
      count:quantity,
      total_revenue:total,
      products!fk_transactions_product ( id, product_name, price, product_type, store_id )
    `)
    .in('store_id', storeIds)
    .gte('transaction_date', since)
    .order('total_revenue', { ascending: false })
    .limit(300); // small cap

  // If raw aggregation is not available via supabase select, do a raw SQL using RPC or you can fetch transactions and aggregate in JS.
  // For portability, we aggregate in JS below if data is transactions list.

  if (error || !rows) {
    // fallback: fetch raw transactions then aggregate client-side
    const { data: txs, error: txErr } = await supabase
      .from('transactions')
      .select('id, transaction_date, product_id, quantity, total, products!fk_transactions_product(id,product_name,product_type,store_id,price), stores!fk_transactions_store(store_id,store_name)')
      .in('store_id', storeIds)
      .gte('transaction_date', since);

    if (txErr) throw txErr;
    // aggregate
    const map = new Map();
    txs.forEach(t => {
      const pid = t.product_id;
      const p = t.products || {};
      const key = pid;
      const existing = map.get(key) || { product_id: pid, product_name: p.product_name || 'Unknown', total_quantity:0, total_revenue:0, store_id: p.store_id };
      existing.total_quantity += Number(t.quantity) || 0;
      existing.total_revenue += Number(t.total) || 0;
      map.set(key, existing);
    });
    const products = Array.from(map.values()).sort((a,b) => b.total_quantity - a.total_quantity).slice(0, limit);

    const labels = products.map(p => p.product_name);
    const data = products.map(p => p.total_quantity);
    const backgroundColors = products.map((_,i) => colorFor(i));
    const totalRevenue = products.reduce((s,p)=>s+p.total_revenue,0);
    const totalQuantity = products.reduce((s,p)=>s+p.total_quantity,0);

    return { labels, data, backgroundColors, products, totalRevenue, totalQuantity, category };
  }

  // If the earlier aggregate returned something usable (depending on Supabase behavior),
  // transform it to expected format. But for reliability we used the fallback above.
  return { labels: [], data: [], backgroundColors: [], products: [], category, totalRevenue: 0, totalQuantity: 0 };
}

/**
 * fetchCustomerEngagement
 * returns time-series for given period (7d,30d,90d,1y)
 */
export async function fetchCustomerEngagement({ ownerId, period = '30d' }) {
  const now = new Date();
  let days = 30;
  if (period === '7d') days = 7;
  if (period === '90d') days = 90;
  if (period === '1y') days = 365;

  const since = startOfDay(subDays(now, days));
  const sinceISO = since.toISOString();

  // get owner stores
  const { data: stores } = await supabase.from('stores').select('store_id').eq('owner_id', ownerId).eq('is_active', true);
  const storeIds = (stores || []).map(s => s.store_id);
  if (!storeIds.length) {
    return { labels: [], datasets: [], summary: { totalCustomers: 0, totalPoints:0, totalTransactions:0, avgPointsPerTransaction:0 }, period };
  }

  // fetch transactions in period
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('id,transaction_date,user_id,total,points,products!fk_transactions_product(id,product_name),users!fk_transactions_user(user_id,username)')
    .in('store_id', storeIds)
    .gte('transaction_date', sinceISO)
    .order('transaction_date', { ascending: true });

  if (error) throw error;

  // build daily buckets
  const labels = [];
  const customersByDay = [];
  const transactionsByDay = [];
  const pointsByDay = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = startOfDay(subDays(now, i));
    const next = startOfDay(subDays(now, i - 1 || 0));
    labels.push(formatISO(day, { representation: 'date' }));
    customersByDay.push(0);
    transactionsByDay.push(0);
    pointsByDay.push(0);
  }

  // map dates to index quickly
  const labelIndex = {};
  labels.forEach((l, idx) => { labelIndex[l] = idx; });

  const uniqueCustomers = new Set();
  let totalPoints = 0;

  txs.forEach(t => {
    const d = new Date(t.transaction_date);
    const key = formatISO(startOfDay(d), { representation: 'date' });
    const idx = labelIndex[key];
    if (idx === undefined) return; // skip outside range
    transactionsByDay[idx] += 1;
    pointsByDay[idx] += Number(t.points) || 0;
    if (t.user_id) uniqueCustomers.add(t.user_id);
    totalPoints += Number(t.points) || 0;
  });

  // compute active customers per day: we approximate by counting unique users per day
  // Build map of day -> Set(users)
  const dayCustomersMap = {};
  txs.forEach(t => {
    const d = new Date(t.transaction_date);
    const key = formatISO(startOfDay(d), { representation: 'date' });
    if (!dayCustomersMap[key]) dayCustomersMap[key] = new Set();
    if (t.user_id) dayCustomersMap[key].add(t.user_id);
  });
  labels.forEach((l, idx) => {
    customersByDay[idx] = dayCustomersMap[l] ? dayCustomersMap[l].size : 0;
  });

  const totalTransactions = txs.length;
  const avgPointsPerTransaction = totalTransactions ? totalPoints / totalTransactions : 0;

  // Prepare datasets for Chart.js with y and y1
  const datasets = [
    {
      label: 'Active Customers',
      data: customersByDay,
      fill: false,
      yAxisID: 'y'
    },
    {
      label: 'Total Transactions',
      data: transactionsByDay,
      fill: false,
      yAxisID: 'y'
    },
    {
      label: 'Points Earned',
      data: pointsByDay,
      fill: false,
      yAxisID: 'y1'
    }
  ];

  const summary = {
    totalCustomers: uniqueCustomers.size,
    totalPoints,
    totalTransactions,
    avgPointsPerTransaction
  };

  return { labels, datasets, summary, period };
}

/**
 * generateRecommendations
 * Lightweight heuristics:
 * - Top products
 * - Products with declining sales (compare last 30d vs previous 30d)
 * - High-value customers (by total spend)
 */
export async function generateRecommendations({ ownerId }) {
  // stores
  const { data: stores } = await supabase.from('stores').select('store_id').eq('owner_id', ownerId).eq('is_active', true);
  const storeIds = (stores || []).map(s => s.store_id);
  if (!storeIds.length) return [];

  // fetch transactions last 90 days
  const now = new Date();
  const since90 = subDays(now, 90).toISOString();

  const { data: txs } = await supabase
    .from('transactions')
    .select('id,transaction_date,product_id,quantity,total,user_id,products!fk_transactions_product(id,product_name,store_id),users!fk_transactions_user(user_id,username,first_name,last_name)')
    .in('store_id', storeIds)
    .gte('transaction_date', since90);

  // aggregate product sales per 30-day window
  const windowAStart = subDays(now, 30); // last 30
  const windowBStart = subDays(now, 60); // previous 30 (30-60 days ago)

  const productAgg = {}; // { product_id: { name, last30:qty, prev30:qty, revenue } }
  const customerAgg = {}; // { user_id: { username, total_spend, tx_count } }

  txs.forEach(t => {
    const pid = t.product_id;
    const productName = t.products?.product_name || 'Unknown';
    if (!productAgg[pid]) productAgg[pid] = { product_id: pid, product_name: productName, last30:0, prev30:0, revenue:0 };
    const txDate = new Date(t.transaction_date);
    const qty = Number(t.quantity) || 0;
    const total = Number(t.total) || 0;

    if (txDate >= windowAStart) productAgg[pid].last30 += qty;
    else if (txDate >= windowBStart) productAgg[pid].prev30 += qty;
    productAgg[pid].revenue += total;

    // customers
    if (t.user_id) {
      const uid = t.user_id;
      if (!customerAgg[uid]) {
        customerAgg[uid] = { user_id: uid, username: (t.users && (t.users.username || `${t.users.first_name||''} ${t.users.last_name||''}`)) || 'Unknown', total_spend:0, tx_count:0 };
      }
      customerAgg[uid].total_spend += total;
      customerAgg[uid].tx_count += 1;
    }
  });

  // top sellers
  const topProducts = Object.values(productAgg)
    .sort((a,b) => b.last30 - a.last30)
    .slice(0,3)
    .map(p => ({ product_id: p.product_id, title: p.product_name, count: p.last30, revenue: p.revenue, type: 'product_optimization', priority: p.last30 > 20 ? 'high' : 'medium', description: `Top seller in last 30 days: ${p.last30} sold.` , action: 'Consider restocking or promoting premium sides.' }));

  // declining products (prev30 > 0 and last30 < prev30 * 0.7)
  const declining = Object.values(productAgg)
    .filter(p => p.prev30 > 0 && p.last30 < p.prev30 * 0.7)
    .sort((a,b) => (a.prev30 - a.last30) - (b.prev30 - b.last30))
    .slice(0,3)
    .map(p => ({ product_id: p.product_id, title: p.product_name, prev30: p.prev30, last30: p.last30, type: 'product_improvement', priority: 'medium', description: `Sales dropped from ${p.prev30} to ${p.last30} (previous 30 vs last 30 days).`, action: 'Try bundle promos or price checks.' }));

  // high value customers
  const highValueCustomers = Object.values(customerAgg)
    .sort((a,b) => b.total_spend - a.total_spend)
    .slice(0,3)
    .map(c => ({ user_id: c.user_id, title: c.username, revenue: c.total_spend, count: c.tx_count, type: 'customer_retention', priority: 'high', description: `${c.username} spent ₱${c.total_spend.toFixed(2)} over ${c.tx_count} transactions.`, action: 'Send loyalty coupon or VIP offer.' }));

  // If not enough data -> insufficient_data rec
  const recs = [...topProducts, ...declining, ...highValueCustomers];
  if (!recs.length) {
    return [{ type: 'insufficient_data', title: 'Insufficient data', priority: 'low', description: 'Need more transactions to generate recommendations', action: 'Collect 30+ transactions' }];
  }
  return recs;
}
