/*
  Replaced/complete OwnerTransactions.js to:
  - Safely query /api/owner/stores and /api/owner/transactions
  - Render rows with store_name
  - Attach Details buttons and open receipt-style modal
  - Guard against missing DOM elements to avoid "null" addEventListener errors
*/

let TXN_DATA = [];
let FILTERED_DATA = [];
let OWNER_STORES = [];
let SORT_STATE = {
  column: 'transaction_date',
  direction: 'desc'
};

document.addEventListener("DOMContentLoaded", async () => {
  // Element references (guarded)
  const storeSelect = document.getElementById('storeFilter');
  const typeSelect = document.getElementById('typeFilterTrans');
  const applyBtn = document.querySelector('.apply-filters-btn');
  const tbody = document.getElementById('transactionsBody');

  // If main elements missing, stop to avoid runtime errors
  if (!tbody) {
    console.warn('OwnerTransactions: transactionsBody not found - aborting script.');
    return;
  }

  // Wire simple helpers
  initTypeFilter();
  initApplyFilters();
  initSorting();

  await loadOwnerStores();
  await loadOwnerTransactions();

  // helper: reload on store/type change if desired
  if (storeSelect) storeSelect.addEventListener('change', applyFiltersAndRender);
  if (typeSelect) typeSelect.addEventListener('change', applyFiltersAndRender);

  // helper functions
  function initTypeFilter() {
    if (!typeSelect) return;
    const types = [
      { value: '', label: 'All Types' },
      { value: 'Purchase', label: 'Purchase' },
      { value: 'Redemption', label: 'Redemption' },
      { value: 'Refund', label: 'Refund' }
    ];
    typeSelect.innerHTML = types.map(t => `<option value="${escapeAttr(t.value)}">${escapeHtml(t.label)}</option>`).join('');
  }

  function initApplyFilters() {
    if (!applyBtn) return;
    applyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      applyFiltersAndRender();
    });
  }

  function initSorting() {
    const sortableHeaders = document.querySelectorAll('th.sortable');
    sortableHeaders.forEach(th => {
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.addEventListener('click', () => {
        const column = th.getAttribute('data-column');
        if (!column) return;
        
        // Toggle direction if same column, otherwise default to desc
        if (SORT_STATE.column === column) {
          SORT_STATE.direction = SORT_STATE.direction === 'asc' ? 'desc' : 'asc';
        } else {
          SORT_STATE.column = column;
          SORT_STATE.direction = 'desc';
        }
        
        // Update header indicators
        updateSortIndicators();
        
        // Re-render with sorting
        renderTransactions(FILTERED_DATA);
      });
    });
    
    // Set initial sort indicator
    updateSortIndicators();
  }

  function updateSortIndicators() {
    // Remove all sort indicators
    document.querySelectorAll('th.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      const existingIcon = th.querySelector('.sort-icon');
      if (existingIcon) existingIcon.remove();
    });
    
    // Add indicator to active column
    const activeHeader = document.querySelector(`th[data-column="${SORT_STATE.column}"]`);
    if (activeHeader) {
      activeHeader.classList.add(SORT_STATE.direction === 'asc' ? 'sort-asc' : 'sort-desc');
      const icon = document.createElement('i');
      icon.className = `fas fa-sort-${SORT_STATE.direction === 'asc' ? 'up' : 'down'} sort-icon`;
      icon.style.marginLeft = '6px';
      icon.style.fontSize = '0.85em';
      activeHeader.appendChild(icon);
    }
  }

  async function applyFiltersAndRender() {
    // simple client-side filter based on already-loaded TXN_DATA
    const type = typeSelect ? typeSelect.value : '';
    const storeId = storeSelect ? storeSelect.value : '';

    FILTERED_DATA = TXN_DATA.filter(g => {
      // transaction type may be at group level or on first item
      const txnType = g.transaction_type || (Array.isArray(g.items) && g.items[0]?.transaction_type) || '';
      if (type && txnType !== type) return false;
      if (storeId && String(g.store_id) !== String(storeId)) return false;
      return true;
    });

    renderTransactions(FILTERED_DATA);
  }

  async function loadOwnerStores() {
    try {
      const res = await fetch('/api/owner/stores');
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const stores = await res.json();
      OWNER_STORES = Array.isArray(stores) ? stores : [];
      populateStoreSelect(OWNER_STORES);
    } catch (err) {
      console.error('Error loading owner stores:', err);
      populateStoreSelect([]);
    }
  }

  function populateStoreSelect(stores) {
    const sel = document.getElementById('storeFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">All Stores</option>' +
      stores.map(s => `<option value="${escapeHtml(s.store_id)}">${escapeHtml(s.store_name)}</option>`).join('');
  }

  async function loadOwnerTransactions() {
    try {
      const res = await fetch('/api/owner/transactions');
      if (!res.ok) {
        const text = await res.text();
        console.error('Server returned non-OK for transactions:', res.status, text);
        throw new Error('Failed to load transactions');
      }
      const grouped = await res.json();
      TXN_DATA = Array.isArray(grouped) ? grouped : [];
      FILTERED_DATA = TXN_DATA;
      renderTransactions(FILTERED_DATA);
    } catch (err) {
      console.error('Error loading owner transactions:', err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px">Failed to load transactions</td></tr>`;
    }
  }

  function renderTransactions(rows) {
    tbody.innerHTML = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:18px;color:#666">No transactions found</td></tr>`;
      return;
    }

    // Sort the rows based on current sort state
    const sortedRows = [...rows].sort((a, b) => {
      let aVal, bVal;
      
      switch (SORT_STATE.column) {
        case 'reference_number':
          aVal = (a.reference_number || '').toLowerCase();
          bVal = (b.reference_number || '').toLowerCase();
          break;
        case 'store_name':
          aVal = (a.store_name || (a.items && a.items[0]?.store_name) || '').toLowerCase();
          bVal = (b.store_name || (b.items && b.items[0]?.store_name) || '').toLowerCase();
          break;
        case 'amount':
          aVal = Number(a.total_amount || 0);
          bVal = Number(b.total_amount || 0);
          break;
        case 'points':
          aVal = Number(a.total_points || 0);
          bVal = Number(b.total_points || 0);
          break;
        case 'transaction_date':
          aVal = a.transaction_date ? new Date(a.transaction_date).getTime() : 0;
          bVal = b.transaction_date ? new Date(b.transaction_date).getTime() : 0;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return SORT_STATE.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return SORT_STATE.direction === 'asc' ? 1 : -1;
      return 0;
    });

    sortedRows.forEach(g => {
      const items = Array.isArray(g.items) ? g.items : [];
      const itemsJson = escapeAttr(JSON.stringify(items));
      const ref = g.reference_number || 'N/A';
      const storeName = g.store_name || (items[0] && items[0].store_name) || 'N/A';
      const dateText = g.transaction_date ? new Date(g.transaction_date).toLocaleString() : '';
      const totalAmount = Number(g.total_amount || 0);
      const totalPoints = Number(g.total_points || 0);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(ref)}</td>
        <td>${escapeHtml(storeName)}</td>
        <td>${formatCurrency(totalAmount)}</td>
        <td>${escapeHtml(String(totalPoints))}</td>
        <td>${escapeHtml(items[0]?.transaction_type || '')}</td>
        <td>${escapeHtml(dateText)}</td>
        <td>
          <button
            class="details-btn"
            type="button"
            aria-label="View receipt"
            title="View receipt"
            data-items='${itemsJson}'
            data-ref='${escapeHtml(ref)}'
            data-total-points='${escapeAttr(String(totalPoints))}'
          >
            <i class="fas fa-receipt" aria-hidden="true"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    initModalHandlers();
  }

  function initModalHandlers() {
    const buttons = document.querySelectorAll('.details-btn');
    buttons.forEach(btn => {
      btn.removeEventListener('click', btn._ownerTxHandler);
      const handler = (e) => {
        const itemsAttr = btn.getAttribute('data-items') || '[]';
        let items = [];
        try { items = JSON.parse(itemsAttr); } catch (err) { items = []; }
        const ref = btn.getAttribute('data-ref') || '';
        const fallbackPoints = Number(btn.getAttribute('data-total-points') || 0);
        showDetails(items, ref, fallbackPoints);
      };
      btn.addEventListener('click', handler);
      btn._ownerTxHandler = handler;
    });
  }

  // expose closeModal globally for inline onclick in template
  window.closeModal = function() {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    // optional: clear modal contents
  };

  /* Replace showDetails with fallback for total points and improved per-item layout */
  function showDetails(items = [], ref = '', fallbackTotalPoints = 0) {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value ?? '';
    };

    // totals and lists
    const totalAmount = items.reduce((s, i) => s + (Number(i.amount) || (Number(i.price) || 0) * (Number(i.quantity) || 0)), 0);

    // compute total points from items if present; otherwise use fallback (group total)
    const itemsPointsSum = items.reduce((s, i) => s + (Number(i.points) || 0), 0);
    const totalPoints = itemsPointsSum > 0 ? itemsPointsSum : Number(fallbackTotalPoints || 0);

    // header / summary fields
    setText('modalRef', ref);
    setText('modalStore', items[0]?.store_name || '');
    setText('modalUser', items[0]?.username || '');
    setText('modalType', items[0]?.transaction_type || '');
    setText('modalDate', items[0]?.transaction_date ? new Date(items[0].transaction_date).toLocaleString() : '');

    // ensure an itemized container exists and render each item (no per-item points)
    let itemsContainer = document.getElementById('modalItemsContainer');
    if (!itemsContainer) {
      const receiptBody = modal.querySelector('.receipt-body') || modal;
      itemsContainer = document.createElement('div');
      itemsContainer.id = 'modalItemsContainer';
      itemsContainer.className = 'receipt-items';
      const summaryNode = receiptBody.querySelector('.receipt-summary');
      receiptBody.insertBefore(itemsContainer, summaryNode || receiptBody.lastElementChild);
    }

    if (!items.length) {
      itemsContainer.innerHTML = '<div class="item-row">No items</div>';
    } else {
      // updated layout: left = product name + meta (qty • unit price), right = line amount
      itemsContainer.innerHTML = items.map(it => {
        const name = escapeHtml(it.product_name || 'Item');
        const qty = escapeHtml(String(it.quantity || 0));
        const unitPrice = formatCurrency(it.price || 0);
        const amount = formatCurrency(Number(it.amount || (it.price * it.quantity) || 0));
        return `
          <div class="item-row" style="display:flex;align-items:flex-start;justify-content:space-between;padding:8px 6px;border-bottom:1px solid rgba(0,0,0,0.05);">
            <div style="flex:1;min-width:0;">
              <div class="item-name" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
              <div class="item-meta" style="margin-top:6px;color:#666;font-size:0.92rem;">
                Qty: ${qty} • ${unitPrice}
              </div>
            </div>
            <div style="margin-left:12px;text-align:right;white-space:nowrap;">
              <div class="item-amount" style="font-weight:700;">${amount}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    // totals
    setText('modalAmount', formatCurrency(totalAmount));
    setText('modalPoints', `${totalPoints} pts`);

    // open modal
    modal.classList.add('open');
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
  }

  // helpers
  function escapeHtml(str = '') {
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }
  function escapeAttr(str = '') {
    return String(str).replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function formatCurrency(num = 0) {
    const n = Number(num) || 0;
    return n.toLocaleString(undefined, { style: 'currency', currency: 'PHP' });
  }
});
