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

export const getSalesSummary = async (req, res) => {
  try {
    const { user } = req.session;
    console.log("📊 [SalesSummary] Session user:", user);

    if (!user) return res.status(401).json({ error: "Unauthorized" });

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
      .in("store_id", stores.map(s => s.store_id));

    console.log("📊 [SalesSummary] Transactions:", transactions?.length);

    if (txError) throw txError;

    const totalSales = transactions.reduce((sum, t) => sum + parseFloat(t.total || 0), 0);
    const totalTransactions = transactions.length;

    console.log("✅ [SalesSummary] Total sales:", totalSales, "Transactions:", totalTransactions);

    res.json({ totalSales, totalTransactions });
  } catch (err) {
    console.error("❌ [SalesSummary] Error:", err);
    res.status(500).json({ error: "Failed to fetch sales summary" });
  }
};


/**
 * API: Get Top Products
 */
export const getTopProducts = async (req, res) => {
  try {
    const { user } = req.session;
    const { category = "all", limit = 5 } = req.query;

    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Fetch store IDs owned by this user
    const { data: stores, error: storeError } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", user.id);

    if (storeError) throw storeError;
    if (!stores.length) return res.json({ topProducts: [] });

    // Fetch transactions joined with products
    let query = supabase
      .from("transactions")
      .select("product_id, quantity, total, products!inner(product_name, product_type)")
      .in("store_id", stores.map(s => s.store_id));

    if (category !== "all") query.eq("products.product_type", category);

    const { data, error } = await query;

    if (error) throw error;

    // Compute top products
    const productStats = {};
    data.forEach(item => {
      const name = item.products?.product_name || "Unknown";
      if (!productStats[name]) productStats[name] = { sales: 0, quantity: 0 };
      productStats[name].sales += parseFloat(item.total || 0);
      productStats[name].quantity += parseInt(item.quantity || 0);
    });

    const topProducts = Object.entries(productStats)
      .map(([name, stats]) => ({
        product_name: name,
        total_sales: stats.sales,
        total_quantity: stats.quantity,
      }))
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, limit);

    console.log("📦 [TopProducts] Success:", topProducts);
    res.json({ topProducts });

  } catch (err) {
    console.error("❌ [TopProducts] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch top products" });
  }
};

/**
 * API: Get Customer Engagement
 */
export const getCustomerEngagement = async (req, res) => {
  try {
    const { user } = req.session;
    const { period = "30d" } = req.query;

    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Fetch all stores owned by the user
    const { data: stores, error: storeError } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", user.id);

    if (storeError) throw storeError;
    if (!stores.length) return res.json({ labels: [], datasets: [], summary: { totalCustomers: 0, totalVisits: 0 }, period });

    // Fetch transactions for those stores
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("user_id, transaction_date")
      .in("store_id", stores.map(s => s.store_id));

    if (txError) throw txError;

    // Group visits per user
    const engagementMap = {};
    transactions.forEach(t => {
      if (t.user_id) engagementMap[t.user_id] = (engagementMap[t.user_id] || 0) + 1;
    });

    const labels = Object.keys(engagementMap).map(id => `User ${id}`);
    const visits = Object.values(engagementMap);

    const totalCustomers = labels.length;
    const totalVisits = visits.reduce((a, b) => a + b, 0);

    // Chart.js-compatible structure
    const chartData = {
      labels,
      datasets: [
        {
          label: "Customer Visits",
          data: visits,
          borderWidth: 2,
          backgroundColor: "rgba(75, 192, 192, 0.3)",
          borderColor: "rgba(75, 192, 192, 1)",
          fill: true,
        },
      ],
      summary: {
        totalCustomers,
        totalVisits,
      },
      period,
    };

    console.log("👥 [Engagement] Chart Data:", chartData);
    res.json(chartData);

  } catch (err) {
    console.error("❌ [Engagement] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch engagement data" });
  }
};



/**
 * API: Get Recommendations
 */
export const getRecommendations = async (req, res) => {
  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // 🏪 Get all stores owned by the user
    const { data: stores, error: storeError } = await supabase
      .from("stores")
      .select("store_id")
      .eq("owner_id", user.id);

    if (storeError) throw storeError;
    if (!stores.length) {
      return res.json({ recommendations: [] });
    }

    // 🧾 Fetch transactions joined with products for those stores
    const { data, error } = await supabase
      .from("transactions")
      .select("product_id, total, products(product_name)")
      .in("store_id", stores.map(s => s.store_id))
      .limit(1000);

    if (error) throw error;

    // 🧮 Group total sales per product
    const salesMap = {};
    data.forEach(item => {
      const name = item.products?.product_name || "Unknown Product";
      if (!salesMap[name]) salesMap[name] = 0;
      salesMap[name] += parseFloat(item.total || 0);
    });

    // 🧠 Format data into meaningful recommendations
    const recommendations = Object.entries(salesMap)
      .map(([product_name, total_sales]) => ({
        title: product_name,
        description: `This product generated ₱${total_sales.toFixed(2)} in sales. It’s performing well compared to others.`,
        type: "product_optimization",
        priority: total_sales > 100 ? "high" : "medium",
        action: total_sales > 100
          ? "Consider increasing stock or featuring this product in promotions."
          : "Monitor performance and adjust pricing or visibility.",
        revenue: total_sales,
        count: 1
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    res.json({ recommendations });

    console.log("💡 [Recommendations] Generated:", recommendations);

  } catch (err) {
    console.error("❌ Error fetching recommendations:", err.message);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
};

