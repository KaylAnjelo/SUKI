let loadedRows = [];
let currentSort = { key: 'date_time', dir: 'desc' };


async function loadUsersIntoDropdown() {
  // Static options already in markup; keep for API parity
  return Promise.resolve();
}

async function loadTransactions() {
  const selectedType = document.getElementById('userFilterTrans').value;
  try {
    const response = await fetch('/reports/transactions/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userType: selectedType })
    });
    if (!response.ok) throw new Error('Failed to fetch transactions');
    loadedRows = await response.json();
    applySortAndRender();
    wireDetailsClick();
  } catch (e) {
    console.error(e);
  }
}

function applySortAndRender() {
  const rows = [...loadedRows];
  const { key, dir } = currentSort;

  rows.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'amount' || key === 'points') {
      av = Number(av) || 0; bv = Number(bv) || 0;
    } else if (key === 'date_time') {
      av = new Date(av).getTime() || 0; bv = new Date(bv).getTime() || 0;
    } else {
      av = String(av || ''); bv = String(bv || '');
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });

  renderRows(rows);
  updateSortIndicators();
}

function renderRows(rows) {
    const tbody = document.getElementById('transactionsBody');
    tbody.innerHTML = '';
    rows.forEach((t) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
        <td>${t.user}</td>
        <td>${t.amount}</td>
        <td>${t.points ?? 0}</td>
        <td>${t.date_time}</td>
        <td>${t.transaction_type}</td>
        <td><a href="#" class="view-details" data-user="${t.user}" data-transaction="${t.transaction_id}" data-amount="${t.amount}" data-points="${t.points ?? 0}" data-date="${t.date_time}" data-type="${t.transaction_type}" data-store="${t.store_name}" data-product="${t.product_details}"><i class="fa-solid fa-circle-info"></i></a></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.key === currentSort.key) {
            th.classList.add(currentSort.dir);
        }
    });
}

function wireSortableHeaders() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = { key, dir: 'asc' };
      }
      applySortAndRender();
    });
  });
}

function wireDetailsClick() {
  const tbody = document.getElementById('transactionsBody');
  if (tbody._detailsWired) return;
  tbody._detailsWired = true;
  tbody.addEventListener('click', function(e) {
    const link = e.target.closest('.view-details');
    if (!link) return;
    e.preventDefault();
    openDetailsModal({
      user: link.dataset.user,
      ref: link.dataset.transaction,
      amount: link.dataset.amount,
      points: link.dataset.points,
      type: link.dataset.type,
      date: link.dataset.date,
      store: link.dataset.store,
      product: link.dataset.product,
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireSortableHeaders();
  loadUsersIntoDropdown().then(loadTransactions);
  const applyBtn = document.getElementById('applyFiltersTrans');
  if (applyBtn) applyBtn.addEventListener('click', loadTransactions);
});

function openDetailsModal(data) {
  const m = document.getElementById('detailsModal');
  document.getElementById('dUser').textContent = data.user || '';
  document.getElementById('dRef').textContent = data.ref || '';
  document.getElementById('dAmount').textContent = formatCurrency(data.amount);
  document.getElementById('dPoints').textContent = String(data.points ?? 0);
  document.getElementById('dType').textContent = data.type || '';
  document.getElementById('dDate').textContent = formatDateHuman(data.date);
  document.getElementById('dStore').textContent = data.store || '';
  document.getElementById('dProduct').textContent = data.product || '';
  m.style.display = 'block';
  // Close when clicking outside content
  m.addEventListener('click', function onBg(e){ if (e.target === m) { closeDetailsModal(); m.removeEventListener('click', onBg); } });
}

function closeDetailsModal() {
  const m = document.getElementById('detailsModal');
  m.style.display = 'none';
}

function formatCurrency(v) {
  const n = Number(v);
  return isFinite(n) ? `₱${n.toFixed(2)}` : (v ?? '');
}

function formatDateHuman(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}


