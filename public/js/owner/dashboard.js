let productChart = null;
let engagementChart = null;
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📊 Owner Dashboard fully loaded');

  // === 🧾 SALES SUMMARY ===
  try {
    const response = await fetch('/owner/dashboard/sales-summary');
    const data = await response.json();

    if (response.ok) {
      document.getElementById('totalSales').textContent = `₱${data.totalSales.toFixed(2)}`;
      document.getElementById('totalOrders').textContent = data.totalTransactions;
    } else {
      document.getElementById('salesPlaceholder').textContent = 'Unable to load sales data';
      document.getElementById('ordersPlaceholder').textContent = 'Unable to load orders data';
    }

    document.getElementById('salesPlaceholder').textContent = '';
    document.getElementById('ordersPlaceholder').textContent = '';
  } catch (error) {
    console.error('❌ Error fetching sales summary:', error);
    document.getElementById('salesPlaceholder').textContent = 'Error loading data';
    document.getElementById('ordersPlaceholder').textContent = 'Error loading data';
  }

  // === 🥧 PRODUCT CHART ===
  initializeProductChart();
  setupCategoryFilter();

  // === 📈 CUSTOMER ENGAGEMENT ===
  loadEngagementData('30d'); // Default to last 30 days
  setupEngagementPeriodFilter();

  // === 💡 RECOMMENDATIONS ===
  initializeRecommendations();
  setupRecommendationRefresh();
});
    // Initialize the product pie chart
    function initializeProductChart() {
      const ctx = document.getElementById('productChart').getContext('2d');
      loadProductData('all');
    }

    // Setup category filter event listener
    function setupCategoryFilter() {
      const categoryFilter = document.getElementById('categoryFilter');
      categoryFilter.addEventListener('change', (e) => {
        loadProductData(e.target.value);
      });
    }

    // Load product data from API
   
    async function loadProductData() {
  try {
    const response = await fetch('/owner/dashboard/top-products?category=all&limit=5');
    const data = await response.json();
    console.log('📦 Product API response:', data);

    // ✅ Safely handle API data
    const products = data?.topProducts || [];

    if (products.length === 0) {
      console.log('📦 No products found');
      return;
    }

    // ✅ Prepare chart data
    const labels = products.map(p => p.product_name);
    const values = products.map(p => p.total_sales);

    // ✅ Render chart (make sure the <canvas id="productChart"> exists)
    const ctx = document.getElementById('productChart');
    if (!ctx) {
      console.warn('⚠️ productChart canvas not found in DOM');
      return;
    }

    const chartContext = ctx.getContext('2d');

    new Chart(chartContext, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Top Products (₱ Sales)',
          data: values,
          backgroundColor: 'rgba(75, 192, 192, 0.3)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true },
        },
      },
    });

  } catch (error) {
    console.error('Error loading product data:', error);
  }
}


    // Show loading state
    function showLoading() {
      const chartContainer = document.querySelector('.chart-container');
      chartContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
      
      document.getElementById('chartLegend').innerHTML = '';
      document.getElementById('chartStats').innerHTML = '';
    }

    // Show no data state
    function showNoData(category) {
      const chartContainer = document.querySelector('.chart-container');
      const categoryText = category === 'all' ? 'all categories' : category;
      chartContainer.innerHTML = `
        <div class="no-data">
          <i class="fas fa-chart-pie"></i>
          <div>No sales data found for ${categoryText}</div>
        </div>
      `;
      
      document.getElementById('chartLegend').innerHTML = '';
      document.getElementById('chartStats').innerHTML = '';
    }

    // Show error state
    function showError(message) {
      const chartContainer = document.querySelector('.chart-container');
      chartContainer.innerHTML = `
        <div class="no-data">
          <i class="fas fa-exclamation-triangle"></i>
          <div>Error: ${message}</div>
        </div>
      `;
      
      document.getElementById('chartLegend').innerHTML = '';
      document.getElementById('chartStats').innerHTML = '';
    }

    // Render the pie chart
    function renderChart(data) {
      const ctx = document.getElementById('productChart').getContext('2d');
      
      // Destroy existing chart if it exists
      if (productChart) {
        productChart.destroy();
      }

      productChart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: data.labels,
          datasets: [{
            data: data.data,
            backgroundColor: data.backgroundColors,
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false // We'll use custom legend
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const product = data.products[context.dataIndex];
                  return [
                    product.product_name,
                    `Quantity: ${product.total_quantity}`,
                    `Revenue: ₱${product.total_revenue.toFixed(2)}`,
                    `Store: ${product.store_name}`
                  ];
                }
              }
            }
          },
          animation: {
            animateRotate: true,
            duration: 1000
          }
        }
      });
    }

    // Render custom legend
    function renderLegend(data) {
      const legendContainer = document.getElementById('chartLegend');
      legendContainer.innerHTML = '';

      data.products.forEach((product, index) => {
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.innerHTML = `
          <div class="legend-color" style="background-color: ${data.backgroundColors[index]}"></div>
          <div class="legend-text">
            <span class="legend-name">${product.product_name}</span>
            <span class="legend-value">${product.total_quantity} sold</span>
          </div>
        `;
        legendContainer.appendChild(legendItem);
      });
    }

    // Render additional statistics
    function renderStats(data) {
      const statsContainer = document.getElementById('chartStats');
      
      const totalQuantity = data.data.reduce((sum, value) => sum + value, 0);
      const totalRevenue = data.products.reduce((sum, product) => sum + product.total_revenue, 0);
      const avgPrice = totalRevenue / totalQuantity || 0;

      statsContainer.innerHTML = `
        <div class="stat-item">
          <span>Total Items Sold:</span>
          <span>${totalQuantity}</span>
        </div>
        <div class="stat-item">
          <span>Total Revenue:</span>
          <span>₱${totalRevenue.toFixed(2)}</span>
        </div>
        <div class="stat-item">
          <span>Average Price:</span>
          <span>₱${avgPrice.toFixed(2)}</span>
        </div>
        <div class="stat-item">
          <span>Category:</span>
          <span>${data.category === 'all' ? 'All Categories' : data.category.charAt(0).toUpperCase() + data.category.slice(1)}</span>
        </div>
      `;
    }

    // ===== CUSTOMER ENGAGEMENT CHART FUNCTIONS =====

    // Initialize the customer engagement line chart
    function initializeEngagementChart() {
      loadEngagementData('30d');
    }

    // Setup engagement period filter event listener
    function setupEngagementPeriodFilter() {
      const periodFilter = document.getElementById('engagementPeriodFilter');
      periodFilter.addEventListener('change', (e) => {
        loadEngagementData(e.target.value);
      });
    }

    // Load engagement data from API
    async function loadEngagementData(period) {
      try {
        showEngagementLoading();
        
        const response = await fetch(`/owner/dashboard/customer-engagement?period=${period}`);
        const data = await response.json();
        console.log('📦 Engagement API response:', data);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch engagement data');
        }

        if (data.labels.length === 0) {
          showEngagementNoData(period);
          return;
        }

        renderEngagementChart(data);
        renderEngagementStats(data);

      } catch (error) {
        console.error('Error loading engagement data:', error);
        showEngagementError(error.message);
      }
    }

    // Show loading state for engagement chart
    function showEngagementLoading() {
      const chartContainer = document.querySelector('.engagement-chart-container');
      chartContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading engagement data...</div>';
      document.getElementById('engagementStats').innerHTML = '';
    }

    // Show no data state for engagement chart
    function showEngagementNoData(period) {
      const chartContainer = document.querySelector('.engagement-chart-container');
      const periodText = getPeriodText(period);
      chartContainer.innerHTML = `
        <div class="no-data">
          <i class="fas fa-chart-line"></i>
          <div>No engagement data found for ${periodText}</div>
        </div>
      `;
      document.getElementById('engagementStats').innerHTML = '';
    }

    // Show error state for engagement chart
    function showEngagementError(message) {
      const chartContainer = document.querySelector('.engagement-chart-container');
      chartContainer.innerHTML = `
        <div class="no-data">
          <i class="fas fa-exclamation-triangle"></i>
          <div>Error: ${message}</div>
        </div>
      `;
      document.getElementById('engagementStats').innerHTML = '';
    }

    // Render the engagement line chart
function renderEngagementChart(data) {
  const canvas = document.getElementById("engagementChart");
  if (!canvas) {
    console.warn("⚠️ Engagement chart canvas not found");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.warn("⚠️ Failed to get 2D context for engagement chart");
    return;
  }

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: data.datasets,
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "Customer Engagement (Last 30 Days)",
        },
      },
    },
  });
}


    // Render engagement statistics
    function renderEngagementStats(data) {
  const statsContainer = document.getElementById('engagementStats');
  const summary = data.summary || {};

  // Define labels for known metrics
  const labelMap = {
    totalCustomers: 'Total Customers',
    totalVisits: 'Total Visits',
    totalPoints: 'Total Points',
    totalTransactions: 'Transactions',
    avgPointsPerTransaction: 'Avg Points / Transaction',
    avgVisitsPerCustomer: 'Avg Visits / Customer',
  };

  // Build HTML dynamically
  statsContainer.innerHTML = Object.entries(summary)
    .map(([key, value]) => {
      const label = labelMap[key] || key;
      const formattedValue =
        typeof value === 'number'
          ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
          : value ?? '—';
      return `
        <div class="engagement-stat-item">
          <span class="engagement-stat-value">${formattedValue}</span>
          <span class="engagement-stat-label">${label}</span>
        </div>
      `;
    })
    .join('');

  // Fallback if summary is empty
  if (!Object.keys(summary).length) {
    statsContainer.innerHTML = `
      <div class="engagement-stat-item">
        <span class="engagement-stat-value">—</span>
        <span class="engagement-stat-label">No Data Available</span>
      </div>
    `;
  }
}


    // Helper function to get period text
    function getPeriodText(period) {
      switch (period) {
        case '7d': return 'Last 7 Days';
        case '30d': return 'Last 30 Days';
        case '90d': return 'Last 90 Days';
        case '1y': return 'Last Year';
        default: return 'Selected Period';
      }
    }

    // ===== K-MEANS RECOMMENDATIONS FUNCTIONS =====

    // Initialize recommendations
    function initializeRecommendations() {
      loadRecommendations();
    }

    // Setup recommendation refresh button
    function setupRecommendationRefresh() {
      const refreshBtn = document.getElementById('refreshRecommendations');
      refreshBtn.addEventListener('click', () => {
        loadRecommendations();
      });
    }

    // Load recommendations from API
    async function loadRecommendations() {
      try {
        showRecommendationsLoading();
        
        const response = await fetch('/owner/dashboard/recommendations');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch recommendations');
        }

        if (data.recommendations.length === 0) {
          showNoRecommendations();
          return;
        }

        renderRecommendations(data.recommendations);

      } catch (error) {
        console.error('Error loading recommendations:', error);
        showRecommendationsError(error.message);
      }
    }

    // Show loading state for recommendations
    function showRecommendationsLoading() {
      const container = document.getElementById('recommendationsContainer');
      container.innerHTML = `
        <div class="loading">
          <i class="fas fa-brain fa-spin"></i>
          <div>Analyzing data with K-means clustering...</div>
        </div>
      `;
    }

    // Show no recommendations state
    function showNoRecommendations() {
      const container = document.getElementById('recommendationsContainer');
      container.innerHTML = `
        <div class="no-recommendations">
          <i class="fas fa-lightbulb"></i>
          <div>No recommendations available</div>
          <div style="font-size: 11px; margin-top: 4px;">Need more transaction data to generate insights</div>
        </div>
      `;
    }

    // Show error state for recommendations
    function showRecommendationsError(message) {
      const container = document.getElementById('recommendationsContainer');
      container.innerHTML = `
        <div class="no-recommendations">
          <i class="fas fa-exclamation-triangle"></i>
          <div>Error loading recommendations</div>
          <div style="font-size: 11px; margin-top: 4px;">${message}</div>
        </div>
      `;
    }

    // Render recommendations
    function renderRecommendations(recommendations) {
      const container = document.getElementById('recommendationsContainer');
      container.innerHTML = '';

      recommendations.forEach((rec, index) => {
        const recommendationElement = createRecommendationElement(rec, index);
        container.appendChild(recommendationElement);
      });
    }

    // Create individual recommendation element
    function createRecommendationElement(rec, index) {
      const div = document.createElement('div');
      div.className = 'recommendation-item';
      
      const iconClass = getRecommendationIcon(rec.type);
      const priorityClass = `priority-${rec.priority}`;
      
      div.innerHTML = `
        <div class="recommendation-icon ${iconClass}">
          <i class="fas ${getRecommendationIconClass(rec.type)}"></i>
        </div>
        <div class="recommendation-header">
          <h4 class="recommendation-title">${rec.title}</h4>
          <span class="recommendation-priority ${priorityClass}">${rec.priority}</span>
        </div>
        <div class="recommendation-description">${rec.description}</div>
        <div class="recommendation-action">
          <span class="action-text">${rec.action}</span>
          <span class="recommendation-type">${(rec.type || 'unkonwn_type').replace('_', ' ')}</span>
        </div>
        ${rec.count ? `<div class="recommendation-stats">
          <span class="stat-badge">${rec.count} customers</span>
        </div>` : ''}
        ${rec.revenue ? `<div class="recommendation-stats">
          <span class="stat-badge">₱${rec.revenue.toFixed(2)} revenue</span>
        </div>` : ''}
      `;
      
      return div;
    }

    // Get recommendation icon class
    function getRecommendationIcon(type) {
      switch (type) {
        case 'customer_segment':
        case 'customer_retention':
        case 'customer_growth':
          return 'customer-segment';
        case 'product_optimization':
        case 'product_improvement':
          return 'product-optimization';
        case 'operational_optimization':
          return 'operational-optimization';
        case 'promotional_strategy':
          return 'promotional-strategy';
        default:
          return 'customer-segment';
      }
    }

    // Get FontAwesome icon class
    function getRecommendationIconClass(type) {
      switch (type) {
        case 'customer_segment':
        case 'customer_retention':
        case 'customer_growth':
          return 'fa-users';
        case 'product_optimization':
        case 'product_improvement':
          return 'fa-box';
        case 'operational_optimization':
          return 'fa-cogs';
        case 'promotional_strategy':
          return 'fa-bullhorn';
        case 'store_optimization':
          return 'fa-store';
        case 'insufficient_data':
          return 'fa-database';
        default:
          return 'fa-lightbulb';
      }
    }