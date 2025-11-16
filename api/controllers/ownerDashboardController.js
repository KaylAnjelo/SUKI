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

    // Get the first store for header display
    const store = stores && stores.length > 0 ? stores[0] : null;

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
      store,
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

    const { category = 'all', limit = 5, days = 30 } = req.query;
    const storeIds = await fetchOwnedStoreIds(userId);
    if (storeIds.length === 0) return res.json({ items: [] });

    console.log(`📊 [TopProducts] Fetching for stores: ${storeIds.join(', ')}, category: ${category}, days: ${days}`);

    // Calculate date filter (fetch last N days)
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days, 10));
    const dateFilter = daysAgo.toISOString();

    // Fetch relevant transactions with joined product info, ordered by date DESC
    const { data: txs, error } = await supabase
      .from('transactions')
      .select('product_id, quantity, total, transaction_date, products:product_id(id, product_name, product_type, product_image)')
      .in('store_id', storeIds)
      .gte('transaction_date', dateFilter)
      .order('transaction_date', { ascending: false })
      .limit(20000); // fetch reasonable cap

    if (error) throw error;

    console.log(`📊 [TopProducts] Fetched ${txs?.length || 0} transactions`);

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

    // optional category filter (case-insensitive matching)
    if (category && category !== 'all') {
      items = items.filter(it => String(it.product_type || '').toLowerCase() === String(category).toLowerCase());
    }

    items.sort((a, b) => b.total_sales - a.total_sales);
    items = items.slice(0, Math.max(0, parseInt(limit, 10) || 5));

    console.log(`📊 [TopProducts] Returning ${items.length} products`, items.map(i => `${i.product_name} (₱${i.total_sales})`));

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
      return res.json({ 
        totalSales: 0, 
        totalOrders: 0,
        salesGrowth: { percentage: '0', class: 'neutral', icon: 'fa-minus' },
        ordersGrowth: { percentage: '0', class: 'neutral', icon: 'fa-minus' }
      });
    }

    // Current period transactions
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

    // Previous period transactions for growth calculation
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);

    const { data: prevTransactions } = await supabase
      .from("transactions")
      .select("total, transaction_date")
      .in("store_id", stores.map(s => s.store_id))
      .gte('transaction_date', prevStart.toISOString())
      .lte('transaction_date', prevEnd.toISOString());

    const prevTotalSales = (prevTransactions || []).reduce((sum, t) => sum + parseFloat(t.total || 0), 0);
    const prevTotalTransactions = (prevTransactions || []).length;

    // Calculate growth percentages
    const calculateGrowth = (current, previous) => {
      if (!previous || previous === 0) return { percentage: '0', class: 'neutral', icon: 'fa-minus' };
      const growth = ((current - previous) / previous) * 100;
      if (growth > 0) return { percentage: Math.abs(growth).toFixed(1), class: 'positive', icon: 'fa-arrow-up' };
      if (growth < 0) return { percentage: Math.abs(growth).toFixed(1), class: 'negative', icon: 'fa-arrow-down' };
      return { percentage: '0', class: 'neutral', icon: 'fa-minus' };
    };

    const salesGrowth = calculateGrowth(totalSales, prevTotalSales);
    const ordersGrowth = calculateGrowth(totalTransactions, prevTotalTransactions);

    console.log("✅ [SalesSummary] Total sales:", totalSales, "Transactions:", totalTransactions);
    console.log("✅ [SalesSummary] Growth - Sales:", salesGrowth, "Orders:", ordersGrowth);

    const payload = { 
      totalSales, 
      totalOrders: totalTransactions, 
      avgOrderValue, 
      days,
      salesGrowth,
      ordersGrowth
    };
    console.log('Sales summary payload:', payload);
    return res.json(payload);
  } catch (err) {
    console.error('getSalesSummary error:', err && err.stack ? err.stack : err);
    // return safe zeroed summary
    return res.status(200).json({ 
      totalSales: 0, 
      totalOrders: 0, 
      avgOrderValue: 0, 
      days: parseInt(req?.query?.days || '30', 10) || 30,
      salesGrowth: { percentage: '0', class: 'neutral', icon: 'fa-minus' },
      ordersGrowth: { percentage: '0', class: 'neutral', icon: 'fa-minus' }
    });
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
 * API: Get Recommendations using Association Rule Mining
 * Implements Apriori-like algorithm to find frequently bought together products
 */
export const getRecommendations = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;
    console.log(`🔍 [Recommendations] Request from user ${userId}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const storeIds = await fetchOwnedStoreIds(userId);
    console.log(`🔍 [Recommendations] Store IDs: ${storeIds.join(', ')}`);
    if (storeIds.length === 0) return res.json({ recommendations: [] });

    // Fetch transactions with product details and user information
    const { data: txs, error } = await supabase
      .from('transactions')
      .select(`
        product_id, 
        reference_number, 
        quantity, 
        total,
        user_id,
        transaction_date,
        products:product_id(id, product_name, product_type, product_image)
      `)
      .in('store_id', storeIds)
      .order('transaction_date', { ascending: false })
      .limit(10000);

    if (error) throw error;
    if (!txs || txs.length === 0) return res.json({ recommendations: [] });

    // Step 1: Group transactions by reference_number (basket)
    const baskets = new Map();
    const productInfo = new Map();
    
    (txs || []).forEach(t => {
      const ref = t.reference_number || `ref:${t.user_id || 'unknown'}_${t.transaction_date}`;
      if (!baskets.has(ref)) baskets.set(ref, []);
      baskets.get(ref).push({
        product_id: Number(t.product_id),
        quantity: Number(t.quantity || 1),
        total: Number(t.total || 0)
      });
      
      // Store product metadata
      if (t.products && !productInfo.has(Number(t.product_id))) {
        productInfo.set(Number(t.product_id), {
          id: t.products.id,
          product_name: t.products.product_name,
          product_type: t.products.product_type,
          product_image: t.products.product_image
        });
      }
    });

    const totalBaskets = baskets.size;
    console.log(`📊 [Recommendations] Analyzing ${totalBaskets} baskets with ${productInfo.size} unique products`);

    // Step 2: Calculate support for individual products
    const productSupport = new Map();
    baskets.forEach(basket => {
      const productIds = new Set(basket.map(item => item.product_id));
      productIds.forEach(pid => {
        productSupport.set(pid, (productSupport.get(pid) || 0) + 1);
      });
    });

    // Filter products by minimum support threshold (appear in at least 2% of transactions)
    const minSupport = 1;
    const frequentProducts = Array.from(productSupport.entries())
      .filter(([_, count]) => count >= minSupport)
      .map(([pid, count]) => ({ 
        product_id: pid, 
        support: count,
        supportPercent: ((count / totalBaskets) * 100).toFixed(1)
      }))
      .sort((a, b) => b.support - a.support);

    console.log(`📊 [Recommendations] Found ${frequentProducts.length} frequent products (min support: ${minSupport})`);

    // Step 3: Calculate association rules (A -> B)
    const associationRules = [];
    
    frequentProducts.slice(0, 15).forEach(itemA => {
      const productA = itemA.product_id;
      
      // Count co-occurrences with other products
      const cooccurrence = new Map();
      
      baskets.forEach(basket => {
        const productIds = basket.map(item => item.product_id);
        if (productIds.includes(productA)) {
          productIds.forEach(productB => {
            if (productB !== productA) {
              cooccurrence.set(productB, (cooccurrence.get(productB) || 0) + 1);
            }
          });
        }
      });

      // Calculate confidence and lift for each rule
      cooccurrence.forEach((count, productB) => {
        const supportAB = count; // baskets containing both A and B
        const supportA = itemA.support;
        const supportB = productSupport.get(productB) || 0;
        
        // Confidence: P(B|A) = support(A,B) / support(A)
        const confidence = (supportAB / supportA) * 100;
        
        // Lift: confidence / P(B) = support(A,B) / (support(A) * support(B))
        const lift = (supportAB * totalBaskets) / (supportA * supportB);
        
        // Only keep strong rules (confidence > 30% and lift > 1.2)
        if (confidence > 20 && lift > 1.2) {
          associationRules.push({
            antecedent: productA,
            consequent: productB,
            support: supportAB,
            confidence: confidence.toFixed(1),
            lift: lift.toFixed(2),
            score: confidence * lift // combined score for ranking
          });
        }
      });
    });

    // Sort by score and group by antecedent
    associationRules.sort((a, b) => b.score - a.score);
    
    console.log(`📊 [Recommendations] Generated ${associationRules.length} association rules`);
    if (associationRules.length > 0) {
      console.log(`📊 [Recommendations] Sample rules:`, associationRules.slice(0, 5).map(r => ({
        from: productInfo.get(r.antecedent)?.product_name,
        to: productInfo.get(r.consequent)?.product_name,
        confidence: `${r.confidence}%`,
        lift: r.lift
      })));
    }

    // Step 4: Format recommendations grouped by product with co-purchase counts
    const recommendationsMap = new Map();
    const coPurchaseCounts = new Map(); // Track how many times pairs appear together
    
    associationRules.forEach(rule => {
      if (!recommendationsMap.has(rule.antecedent)) {
        recommendationsMap.set(rule.antecedent, []);
      }
      
      const recs = recommendationsMap.get(rule.antecedent);
      if (recs.length < 5) { // Top 5 recommendations per product
        const pairKey = `${rule.antecedent}-${rule.consequent}`;
        coPurchaseCounts.set(pairKey, rule.support);
        
        recs.push({
          product_id: rule.consequent,
          confidence: rule.confidence,
          lift: rule.lift,
          score: rule.score,
          support: rule.support
        });
      }
    });

    // Step 5: Build final recommendations with product details and insights
    const recommendations = [];
    
    recommendationsMap.forEach((recs, productId) => {
      const productData = productInfo.get(productId);
      if (!productData) return;
      
      const recommendedProducts = recs.map(r => {
        const recProduct = productInfo.get(r.product_id);
        if (!recProduct) return null;
        
        // Generate detailed insight based on metrics
        let insight = '';
        const coPurchases = r.support;
        const confidence = parseFloat(r.confidence);
        const lift = parseFloat(r.lift);
        
        if (coPurchases >= 5 && confidence >= 50) {
          insight = `Strong bundle recommendation: These items frequently appear together in transaction logs (co-purchased ${coPurchases} times). ${confidence.toFixed(0)}% of customers who bought "${productData.product_name}" also bought this item.`;
        } else if (coPurchases >= 3 && lift >= 2.0) {
          insight = `Popular combination: Customers are ${lift.toFixed(1)}x more likely to buy these items together (appeared in ${coPurchases} transactions). Consider creating a combo deal.`;
        } else if (confidence >= 40) {
          insight = `Frequent pairing: ${confidence.toFixed(0)}% of customers who purchased "${productData.product_name}" also added this to their order (${coPurchases} times). Good cross-selling opportunity.`;
        } else {
          insight = `Complementary item: Analysis shows customers who buy "${productData.product_name}" are ${lift.toFixed(1)}x more interested in this product compared to average shoppers.`;
        }
        
        return {
          product_id: r.product_id,
          product_name: recProduct.product_name,
          product_image: recProduct.product_image,
          product_type: recProduct.product_type,
          confidence: confidence,
          lift: lift,
          score: r.score,
          coPurchases: coPurchases,
          reason: `${confidence.toFixed(1)}% confidence, ${lift}x lift`,
          insight: insight
        };
      }).filter(Boolean);

      if (recommendedProducts.length > 0) {
        // Generate overall insight for this product's recommendations
        const totalCoPurchases = recommendedProducts.reduce((sum, r) => sum + r.coPurchases, 0);
        const avgConfidence = recommendedProducts.reduce((sum, r) => sum + r.confidence, 0) / recommendedProducts.length;
        
        let overallInsight = '';
        if (avgConfidence >= 60) {
          overallInsight = `High conversion potential: Customers who buy "${productData.product_name}" show strong purchasing patterns with these ${recommendedProducts.length} items. Total co-purchases: ${totalCoPurchases}.`;
        } else if (recommendedProducts.length >= 3) {
          overallInsight = `Multiple pairing opportunities: "${productData.product_name}" pairs well with ${recommendedProducts.length} different items. Consider featuring these in product descriptions or at checkout.`;
        } else {
          overallInsight = `Bundle opportunity: Based on ${totalBaskets} transactions, these items complement "${productData.product_name}" well.`;
        }
        
        recommendations.push({
          product_id: productId,
          product_name: productData.product_name,
          product_image: productData.product_image,
          product_type: productData.product_type,
          support: productSupport.get(productId),
          recommended: recommendedProducts,
          overallInsight: overallInsight
        });
      }
    });

    // Sort by product popularity (support)
    recommendations.sort((a, b) => b.support - a.support);

    console.log(`✅ [Recommendations] Returning ${recommendations.length} product recommendations`);
    if (recommendations.length > 0) {
      console.log(`✅ [Recommendations] Sample:`, recommendations[0]);
    }

    return res.json({ 
      recommendations: recommendations.slice(0, 10),
      metadata: {
        totalBaskets,
        frequentProductsCount: frequentProducts.length,
        rulesGenerated: associationRules.length,
        algorithm: 'Association Rule Mining (Apriori-based)',
        metrics: 'Confidence, Lift, Support'
      }
    });

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
