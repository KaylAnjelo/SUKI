// ...simple sales report frontend using the JSON endpoints created on server
document.addEventListener('DOMContentLoaded', () => {
  const storeSel = document.getElementById('storeFilter');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');
  const sortBy = document.getElementById('sortBy');
  const pageLimit = document.getElementById('pageLimit');
  const applyBtn = document.getElementById('applyFilters');
  const salesBody = document.getElementById('salesBody');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');
  const exportCsvBtn = document.getElementById('exportCsv');
  const exportPdfBtn = document.getElementById('exportPdf');

  if (!salesBody) {
    console.warn('SalesReport: salesBody not found, aborting.');
    return;
  }

  let page = 1;

  async function safeJson(res) {
    const text = await res.text();
    try { return JSON.parse(text); }
    catch (err) { throw new Error('Invalid JSON response: ' + text.slice(0,300)); }
  }

  async function loadStores() {
    try {
      const res = await fetch('/api/owner/sales-report/stores/dropdown');
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`stores dropdown failed ${res.status}: ${t.slice(0,200)}`);
      }
      const stores = await res.json();
      if (storeSel) {
        storeSel.innerHTML = `<option value="">All Stores</option>` + (Array.isArray(stores) ? stores.map(s => `<option value="${s.store_id}">${s.store_name}</option>`).join('') : '');
      }
    } catch (err) {
      console.error('Error loading stores:', err);
      if (storeSel) storeSel.innerHTML = '<option value="">All Stores</option>';
    }
  }

  function buildQuery({ page = 1, limit = 10 } = {}) {
    const q = new URLSearchParams();
    if (storeSel && storeSel.value) q.set('storeId', storeSel.value);
    if (dateFrom && dateFrom.value) q.set('dateFrom', dateFrom.value);
    if (dateTo && dateTo.value) q.set('dateTo', dateTo.value);
    if (sortBy && sortBy.value) q.set('sortBy', sortBy.value);
    q.set('page', String(page));
    q.set('limit', String(limit));
    return q.toString();
  }

  async function loadReport() {
    const limit = Number(pageLimit?.value || 10);
    const qs = buildQuery({ page, limit });
    try {
      const res = await fetch(`/api/owner/sales-report?${qs}`);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`sales-report failed ${res.status}: ${t.slice(0,300)}`);
      }
      const payload = await res.json();
      renderTable(payload.sales || []);
      pageInfo && (pageInfo.textContent = `Page ${payload.page || page} / ${payload.totalPages || 1} • Total: ${payload.total || 0}`);
      prevBtn && (prevBtn.disabled = page <= 1);
      nextBtn && (nextBtn.disabled = page >= (payload.totalPages || 1));
    } catch (err) {
      console.error('Error loading sales data:', err);
      salesBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#666;padding:12px;">Failed to load report</td></tr>`;
    }
  }

  function renderTable(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      salesBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#666;padding:12px">No data</td></tr>`;
      return;
    }
    salesBody.innerHTML = rows.map(r => `
      <tr>
        <td>${new Date(r.date).toLocaleString()}</td>
        <td>${r.reference}</td>
        <td>${r.product}</td>
        <td>${Number(r.amount).toFixed(2)}</td>
        <td>${r.store_name}</td>
      </tr>
    `).join('');
  }

  function exportCsv() {
    const qs = buildQuery({ page: 1, limit: 100000 });
    window.open(`/api/owner/sales-report/csv?${qs}`, '_blank');
  }
  function exportPdf() {
    const qs = buildQuery({ page: 1, limit: 100000 });
    window.open(`/api/owner/sales-report/pdf?${qs}`, '_blank');
  }

  applyBtn && applyBtn.addEventListener('click', (e) => { e.preventDefault(); page = 1; loadReport(); });
  prevBtn && prevBtn.addEventListener('click', () => { if (page>1) { page--; loadReport(); } });
  nextBtn && nextBtn.addEventListener('click', () => { page++; loadReport(); });
  exportCsvBtn && exportCsvBtn.addEventListener('click', exportCsv);
  exportPdfBtn && exportPdfBtn.addEventListener('click', exportPdf);

  (async function init(){ await loadStores(); await loadReport(); })();
});