if (window._ownerDashboardInit) {
  console.warn("Dashboard already initialized.");
} else {
  window._ownerDashboardInit = true;
  console.log("📊 Owner Dashboard fully loaded");

  // Safe fetch helper (single canonical API path per endpoint)
  async function tryFetchJson(url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status}: ${text}`);
      return JSON.parse(text);
    } catch (err) {
      throw err;
    }
  }

  // Small HTML-escape helper
  function escapeHtml(input) {
    if (input === null || input === undefined) return '';
    return String(input).replace(/[&<>"'`=\/]/g, function (s) {
      return ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
        "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
      })[s];
    });
  }

  // Engagement
  async function loadEngagementData(period = "30d") {
    const url = `/api/owner/dashboard/customer-engagement?period=${encodeURIComponent(period)}`;
    try {
      const payload = await tryFetchJson(url);
      console.log("📦 Engagement API response:", payload);
      if (typeof renderEngagementChart === "function") renderEngagementChart(payload);
      if (typeof renderEngagementStats === "function") renderEngagementStats(payload.summary || {});
      return payload;
    } catch (err) {
      console.error("❌ Error loading engagement data:", err);
      if (typeof renderEngagementChart === "function") renderEngagementChart({ labels: [], datasets: [{ data: [] }] });
      if (typeof renderEngagementStats === "function") renderEngagementStats({ totalCustomers: 0, totalVisits: 0, totalPoints: 0 });
      return null;
    }
  }

  /* ------------------------
     Top products: loader + renderers (robust)
     ------------------------ */

  // create / populate category dropdown and attach listener
  function ensureCategoryDropdown(defaultValue = 'all') {
    let sel = document.getElementById('categoryFilter');
    // find sensible parent to insert the dropdown (above topProductsList)
    const parent = document.querySelector('#productsPanel') || document.querySelector('.metric-card') || document.querySelector('.dashboard-content') || document.body;
    if (!sel) {
      sel = document.createElement('select');
      sel.id = 'categoryFilter';
      sel.className = 'category-filter';
      
      // Add all allowed options
      const options = [
        { value: 'all', text: 'All Categories' },
        { value: 'Meal', text: 'Meals' },
        { value: 'Side', text: 'Sides' },
        { value: 'Beverage', text: 'Beverages' }
      ];
      
      options.forEach(({ value, text }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        sel.appendChild(opt);
      });
      
      // insert before the products list if present
      const ref = parent.querySelector('#topProductsList') || parent.firstElementChild;
      parent.insertBefore(sel, ref);
      // attach change handler
      sel.addEventListener('change', (e) => {
        // call loader with selected category and default limit
        loadProductData(e.target.value, 5).catch(err => console.error('loadProductData error', err));
      });
    }
    sel.value = defaultValue;
    return sel;
  }

  // update loader to capture categories and populate dropdown
  async function loadProductData(category = 'all', limit = 5) {
    const qs = `?category=${encodeURIComponent(category)}&limit=${encodeURIComponent(limit)}`;
    const url = `/api/owner/dashboard/top-products${qs}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) {
        console.error('Top products fetch failed', res.status, text.slice(0,200));
        throw new Error(`${res.status}: ${text}`);
      }
      let payload;
      try { payload = JSON.parse(text); } catch (e) { payload = text; }
      console.log('📦 Product API response:', payload);

      // normalize possible payload shapes to an array of items
      let items = [];
      if (Array.isArray(payload)) items = payload;
      else if (Array.isArray(payload.items)) items = payload.items;
      else if (Array.isArray(payload.data)) items = payload.data;
      else if (Array.isArray(payload.rows)) items = payload.rows;
      else if (payload && Array.isArray(payload.results)) items = payload.results;
      else items = [];

      // normalize fields for each item (include product_type)
      items = items.map(it => ({
        product_id: Number(it.id ?? it.product_id ?? it.productId ?? 0),
        product_name: it.product_name ?? it.name ?? it.title ?? '',
        image_url: it.image_url ?? it.image ?? it.thumbnail ?? it.product_image ?? '',
        product_type: it.product_type ?? it.type ?? it.productType ?? null,
        total_quantity: Number(it.total_quantity ?? it.quantity ?? it.count ?? it.purchased_count ?? it.total_qty ?? 0),
        total_sales: Number(it.total_sales ?? it.total_amount ?? it.total ?? it.sales ?? 0)
      }));

      // Validate image URLs to prevent syntax errors
      items = items.map(it => ({
        ...it,
        image_url: (it.image_url && typeof it.image_url === 'string' && (it.image_url.startsWith('http') || it.image_url.startsWith('/'))) ? it.image_url : ''
      }));

      // Only allow specific categories: Meal, Side, Beverage
      const allowedCategories = ['Meal', 'Side', 'Beverage'];
      const categories = Array.from(new Set(items.map(i => i.product_type).filter(cat => allowedCategories.includes(cat)))).sort();
      const dropdown = ensureCategoryDropdown(category || 'all');
      
      // Keep only allowed categories in dropdown
      Array.from(dropdown.options).forEach(opt => { 
        if (opt.value !== 'all' && !allowedCategories.includes(opt.value)) {
          opt.remove(); 
        }
      });
      
      // Ensure all allowed categories are present in dropdown
      allowedCategories.forEach(cat => {
        if (![...dropdown.options].some(o => o.value === cat)) {
          const o = document.createElement('option');
          o.value = cat;
          o.textContent = cat === 'Meal' ? 'Meals' : cat === 'Side' ? 'Sides' : 'Beverages';
          dropdown.appendChild(o);
        }
      });
      // ensure selected value exists
      if (![...dropdown.options].some(o => o.value === category)) dropdown.value = 'all';

      // if server doesn't filter by category, filter client-side
      const filtered = (category && category !== 'all') ? items.filter(i => String(i.product_type) === String(category)) : items;

      // render
      renderTopProducts(filtered);
      renderTopProductsChart(filtered);
      return filtered;
    } catch (err) {
      console.error('❌ Error loading product data:', err);
      renderTopProducts([]);
      renderTopProductsChart([]);
      return [];
    }
  }

  function ensureTopProductsContainer() {
    let list = document.getElementById('topProductsList');
    if (list) return list;
    // try to find sensible parent
    const parent = document.querySelector('.metric-card.recommendation') || document.querySelector('#productsPanel') || document.querySelector('.dashboard-content') || document.body;
    const ul = document.createElement('ul');
    ul.id = 'topProductsList';
    ul.className = 'top-products-list';
    parent.appendChild(ul);
    console.warn('Placeholder created: #topProductsList appended to', parent.tagName);
    return ul;
  }

  function renderTopProducts(items = []) {
    const list = ensureTopProductsContainer();
    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = `<li class="muted">No top products</li>`;
      return;
    }

    // inline SVG placeholder (no external file)
    const placeholderSvg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>
         <rect width='100%' height='100%' fill='%23f5f5f5' rx='8' />
         <g fill='%237c0f0f' font-family='sans-serif' font-size='10' text-anchor='middle'>
           <text x='50%' y='45%'>No</text>
           <text x='50%' y='60%'>Image</text>
         </g>
       </svg>`
    );
    const placeholder = `data:image/svg+xml;charset=UTF-8,${placeholderSvg}`;

    list.innerHTML = items.map(it => {
      const name = escapeHtml(it.product_name || it.name || 'Unnamed product');
      const purchases = Number(it.total_quantity || 0);
      const sales = Number(it.total_sales || 0).toLocaleString();
      const imgSrc = it.image_url ? escapeHtml(it.image_url) : placeholder;

      return `
        <li class="product-card">
          <div class="product-card-inner">
            <div class="product-thumb">
              <img src="${imgSrc}" alt="${name}" onerror="this.onerror=null;this.src='${placeholder}';" />
            </div>
            <div class="product-body">
              <div class="product-name">${name}</div>
              <div class="product-meta">
                <span class="purchased-count">Purchased: <strong>${purchases}</strong></span>
                <span class="sales-amount">₱${sales}</span>
              </div>
            </div>
          </div>
        </li>
      `;
    }).join('');
  }

  function renderTopProductsChart(items = []) {
    // keep API compatibility but do NOT render an additional list (avoids duplicate lists)
    if (window._ownerProductChart instanceof Chart) {
      try { window._ownerProductChart.destroy(); } catch (e) { /* ignore */ }
      window._ownerProductChart = null;
    }

    // keep chart wrapper clean — we already render the image card list via renderTopProducts()
    const wrapper = document.getElementById('chartWrapper');
    if (!wrapper) return;

    // Clear any previous chart content so only the card list remains visible
    wrapper.innerHTML = '';

    // Optional: show a small summary instead of a list (uncomment if desired)
    // if (Array.isArray(items) && items.length) {
    //   wrapper.innerHTML = `<div class="tp-summary">Top ${items.length} products</div>`;
    // }

    return;
  }

  // Recommendations
  /* ------------------------
     Recommendations cache + loading (patched)
     ------------------------ */

  let _recommendationsCache = null;
  let _recommendationsLoading = false;

  function setRecommendationsLoading(show) {
    const container = document.getElementById('recommendationsContainer');
    if (!container) return;
    // if data already loaded, don't overwrite with loading indicator
    if (show && !_recommendationsCache) {
      _recommendationsLoading = true;
      container.innerHTML = '<div class="loading">Loading recommendations…</div>';
    } else {
      _recommendationsLoading = false;
      // only call renderRecommendations if it's defined
      if (typeof renderRecommendations === 'function') {
        renderRecommendations(_recommendationsCache && _recommendationsCache.length ? _recommendationsCache : []);
      } else {
        // fallback simple render if function not present
        if (_recommendationsCache && _recommendationsCache.length) {
          container.innerHTML = _recommendationsCache.map(r => {
            const title = (r.product_name || r.title || `#${r.product_id || ''}`);
            const recommended = Array.isArray(r.recommended) ? r.recommended : (Array.isArray(r.recommended_with) ? r.recommended_with : []);
            const recList = recommended.length ? `<ul>${recommended.map(x => `<li>${(x.product_name||x.title||`#${x.product_id||''}`)}</li>`).join('')}</ul>` : '<div class="muted">No related items</div>';
            return `<div class="recommendation-card"><div class="rec-title"><strong>${escapeHtml(title)}</strong></div><div class="rec-body">${recList}</div></div>`;
          }).join('');
        } else {
          container.innerHTML = '<div class="muted">No recommendations available</div>';
        }
      }
    }
  }

  async function loadRecommendations(force = false) {
    
    if (!force && Array.isArray(_recommendationsCache) && _recommendationsCache.length) {
      console.debug('Recommendations: using cached data, skipping network fetch');
      // ensure we do not show loader over existing content
      if (typeof renderRecommendations === 'function') renderRecommendations(_recommendationsCache);
      return _recommendationsCache;
    }

    setRecommendationsLoading(true);
    const url = `/api/owner/dashboard/recommendations`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) {
        console.error('Recommendations API', res.status, text.slice(0,200));
        throw new Error(`${res.status}: ${text}`);
      }
      const payload = JSON.parse(text);
      const recs = Array.isArray(payload) ? payload : (Array.isArray(payload.recommendations) ? payload.recommendations : (Array.isArray(payload.items) ? payload.items : []));
      _recommendationsCache = recs;
      setRecommendationsLoading(false);
      if (typeof renderRecommendations === 'function') renderRecommendations(recs);
      return recs;
    } catch (err) {
      console.error('Error loading recommendations:', err);
      _recommendationsCache = _recommendationsCache || [];
      setRecommendationsLoading(false);
      if (typeof renderRecommendations === 'function') renderRecommendations(_recommendationsCache);
      return _recommendationsCache;
    }
  }

  // Dashboard summary
  async function loadDashboardSummary() {
    const url = `/api/owner/dashboard/sales-summary`;
    try {
      const payload = await tryFetchJson(url);
      console.debug('Parsed summary payload:', payload);
      if (typeof renderTotalSales === 'function') renderTotalSales(payload.totalSales ?? payload.total_amount ?? 0);
      if (typeof renderTotalOrders === 'function') renderTotalOrders(payload.totalOrders ?? payload.total_orders ?? 0);
      return payload;
    } catch (err) {
      console.warn('Summary fetch failed', err);
      if (typeof renderTotalSales === 'function') renderTotalSales(0);
      if (typeof renderTotalOrders === 'function') renderTotalOrders(0);
      return null;
    }
  }

  // DOM init (single listener)
  document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ DOM fully loaded, initializing dashboard...");
    // export aliases for any inline callers
    window.loadTopProducts = loadProductData;
    window.loadRecommendations = loadRecommendations;
    // start loaders
    loadEngagementData().catch(() => {});
    loadProductData().catch(() => {});
    loadRecommendations().catch(() => {});
    loadDashboardSummary().catch(() => {});

    // UI hooks
    const categoryFilter = document.getElementById("categoryFilter");
    if (categoryFilter) categoryFilter.addEventListener("change", (e) => loadProductData(e.target.value));
    const engagementFilter = document.getElementById("engagementPeriodFilter");
    if (engagementFilter) engagementFilter.addEventListener("change", (e) => loadEngagementData(e.target.value));
    const refreshBtn = document.getElementById("refreshRecommendations");
    if (refreshBtn) refreshBtn.addEventListener("click", () => loadRecommendations(true)); // <-- force refresh
  });
} // end init guard

// ------------------------
// Renderers (safe)
// ------------------------
function renderTotalSales(value) {
  const el = document.getElementById('totalSales');
  if (!el) return;
  el.textContent = Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'PHP' });
}
function renderTotalOrders(value) {
  const el = document.getElementById('totalOrders');
  if (!el) return;
  el.textContent = String(value || 0);
}

function renderEngagementChart(payload) {
  const ctx = document.getElementById("engagementChart");
  if (!ctx) return;
  const labels = payload.labels || [];
  const data = payload.datasets?.[0]?.data || [];
  if (window._engagementChartInstance) window._engagementChartInstance.destroy();
  window._engagementChartInstance = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Customer Engagement", data, borderColor: "#7C0F0F", backgroundColor: "rgba(124, 15, 15, 0.1)", fill:true, tension:0.3 }] },
    options: { responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}
function renderEngagementStats(summary) {
  const container = document.getElementById("engagementStats");
  if (!container) return;
  container.innerHTML = `
    <div class="stat-item">👥 Total Customers: <strong>${summary.totalCustomers ?? 0}</strong></div>
    <div class="stat-item">🛍️ Total Visits: <strong>${summary.totalVisits ?? 0}</strong></div>
    <div class="stat-item">⭐ Total Points: <strong>${summary.totalPoints ?? 0}</strong></div>
  `;
}

// Backwards compatibility aliases
if (typeof window.loadTopProducts === 'undefined') window.loadTopProducts = (c,l) => loadProductData(c,l);
if (typeof window.loadRecommendations === 'undefined') window.loadRecommendations = () => loadRecommendations();
if (typeof window.renderTopProducts === 'undefined') window.renderTopProducts = (items)=> renderTopProducts(items);

// Add enriched renderer and helper
async function enrichRecommendations(rawRecs) {
  // rawRecs might be rows like { product_id, recommended_product_id, score }
  if (!Array.isArray(rawRecs) || rawRecs.length === 0) return [];

  const grouped = new Map();
  let needsEnrich = false;
  for (const r of rawRecs) {
    const a = r.product_id ?? r.productId ?? null;
    const b = r.recommended_product_id ?? r.recommendedProductId ?? r.recommended_id ?? null;
    if (a != null && b != null) {
      needsEnrich = true;
      if (!grouped.has(a)) grouped.set(a, []);
      grouped.get(a).push({ product_id: Number(b), score: Number(r.score ?? r.count ?? 0) });
    } else {
      // already enriched shape, return as-is
      return rawRecs;
    }
  }

  if (!needsEnrich) return rawRecs;

  // fetch owner products (use existing loader to get product metadata)
  // loadProductData returns array of product objects with product_id, product_name, image_url
  let products = [];
  try {
    products = await loadProductData('all', 200);
  } catch (e) {
    console.warn('Could not fetch product metadata for enrichment', e);
    products = [];
  }
  const prodMap = new Map((products || []).map(p => [Number(p.product_id), p]));
  
  const enriched = [];
  for (const [pid, arr] of grouped.entries()) {
    const p = prodMap.get(Number(pid)) || { product_id: Number(pid), product_name: `#${pid}`, image_url: '' };
    const recs = arr
      .map(r => {
        const rp = prodMap.get(r.product_id) || { product_id: r.product_id, product_name: `#${r.product_id}`, image_url: '' };
        return { product_id: rp.product_id, product_name: rp.product_name, image_url: rp.image_url, score: r.score };
      })
      .sort((a,b) => b.score - a.score);
    enriched.push({ product_id: p.product_id, product_name: p.product_name, image_url: p.image_url, recommended: recs });
  }

  return enriched;
}

function renderRecommendations(recs = []) {
  const container = document.getElementById('recommendationsContainer');
  if (!container) return;
  const placeholderSvg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><rect width='100%' height='100%' fill='%23f5f5f5' rx='6' /><g fill='%237c0f0f' font-family='sans-serif' font-size='8' text-anchor='middle'><text x='50%' y='45%'>No</text><text x='50%' y='60%'>Img</text></g></svg>`
  );
  const placeholder = `data:image/svg+xml;charset=UTF-8,${placeholderSvg}`;

  if (!Array.isArray(recs) || recs.length === 0) {
    container.innerHTML = '<div class="muted">No recommendations available</div>';
    return;
  }

  container.innerHTML = recs.map(r => {
    const title = escapeHtml(r.product_name || `#${r.product_id || ''}`);
    const img = r.image_url ? escapeHtml(r.image_url) : placeholder;
    const recommended = Array.isArray(r.recommended) ? r.recommended : (Array.isArray(r.recommended_with) ? r.recommended_with : []);
    const recList = recommended.length
      ? `<ul class="rec-list">${recommended.map(x => {
          const ix = x.image_url ? escapeHtml(x.image_url) : placeholder;
          return `<li class="rec-item"><img src="${ix}" alt="${escapeHtml(x.product_name||`#${x.product_id||''}`)}" onerror="this.onerror=null;this.src='${placeholder}';" /><div class="rec-meta"><div class="rec-name">${escapeHtml(x.product_name || `#${x.product_id || ''}`)}</div><div class="rec-score">(${x.score ?? 0})</div></div></li>`;
        }).join('')}</ul>`
      : '<div class="muted">No related items</div>';

    return `<div class="recommendation-card"><div class="rec-head"><img class="rec-head-img" src="${img}" onerror="this.onerror=null;this.src='${placeholder}';" /><div class="rec-head-title">${title}</div></div><div class="rec-body">${recList}</div></div>`;
  }).join('');
}

// Integrate enrichment into loadRecommendations
async function loadRecommendations(force = false) {
  if (!force && Array.isArray(_recommendationsCache) && _recommendationsCache.length) {
    console.debug('Recommendations: using cached data, skipping network fetch');
    if (typeof renderRecommendations === 'function') renderRecommendations(_recommendationsCache);
    return _recommendationsCache;
  }

  setRecommendationsLoading(true);
  const url = `/api/owner/dashboard/recommendations`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) {
      console.error('Recommendations API', res.status, text.slice(0,200));
      throw new Error(`${res.status}: ${text}`);
    }
    const payload = JSON.parse(text);
    const raw = Array.isArray(payload) ? payload : (Array.isArray(payload.recommendations) ? payload.recommendations : (Array.isArray(payload.items) ? payload.items : []));
    // enrich raw rows into grouped objects with product metadata
    const enriched = await enrichRecommendations(raw);
    _recommendationsCache = enriched;
    setRecommendationsLoading(false);
    if (typeof renderRecommendations === 'function') renderRecommendations(enriched);
    return enriched;
  } catch (err) {
    console.error('Error loading recommendations:', err);
    _recommendationsCache = _recommendationsCache || [];
    setRecommendationsLoading(false);
    if (typeof renderRecommendations === 'function') renderRecommendations(_recommendationsCache);
    return _recommendationsCache;
  }
}
