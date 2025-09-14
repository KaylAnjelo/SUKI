let TXN_DATA = [];
let FILTERED_DATA = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("/transactions");
    TXN_DATA = await response.json();
    FILTERED_DATA = [...TXN_DATA];
    renderTransactions(FILTERED_DATA);
    initSorting();
    initModalHandlers();
    initTypeFilter();
  } catch (err) {
    console.error("Error loading transactions:", err);
  }
});

function renderTransactions(rows) {
  const tbody = document.getElementById("transactionsBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(tx => {
    const tr = document.createElement("tr");

    const ref = tx.reference_number || "N/A";
    const userName = tx.users?.username || "N/A";
    const storeName = tx.stores?.store_name || "N/A";
    const productName = tx.products?.product_name || "N/A";
    const amountNum = Number(tx.quantity) * Number(tx.price || 0);
    const amount = isFinite(amountNum) ? amountNum.toFixed(2) : "0.00";
    const points = tx.points ?? 0;
    const type = tx.transaction_type || "";
    const date = new Date(tx.transaction_date).toLocaleString();

    tr.innerHTML = `
      <td>${ref}</td>
      <td>${storeName}</td>
      <td>₱${amount}</td>
      <td>${points}</td>
      <td>${type}</td>
      <td>${date}</td>
      <td>
        <button class="details-btn" title="View details" data-id="${tx.id}">
          <i class="fas fa-receipt"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach event listener for details buttons
  document.querySelectorAll(".details-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const transaction = FILTERED_DATA.find(t => String(t.id) === String(id))
        || TXN_DATA.find(t => String(t.id) === String(id));
      showDetails(transaction);
    });
  });
}

// Sorting
let currentSort = { column: null, direction: 'asc' };

function initSorting() {
  const headers = document.querySelectorAll("th.sortable");
  headers.forEach(h => {
    h.addEventListener('click', () => {
      const column = h.getAttribute('data-column');
      if (!column) return;

      // Toggle direction or set default
      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = { column, direction: 'asc' };
      }

      // Update header classes
      document.querySelectorAll('th.sortable').forEach(th => th.classList.remove('asc', 'desc'));
      h.classList.add(currentSort.direction);

      // Sort filtered data copy and render
      const sorted = [...FILTERED_DATA].sort((a, b) => compareByColumn(a, b, column, currentSort.direction));
      FILTERED_DATA = sorted;
      renderTransactions(FILTERED_DATA);
    });
  });
}

function compareByColumn(a, b, column, direction) {
  const dir = direction === 'desc' ? -1 : 1;
  // Map displayed columns to raw values used in rendering
  const mapValue = (row) => {
    switch (column) {
      case 'reference_number': return row.reference_number || '';
      case 'user_name': return row.users?.username || '';
      case 'store_name': return row.stores?.store_name || '';
      case 'amount': return Number(row.quantity) * Number(row.price || 0);
      case 'points': return Number(row.points || 0);
      case 'transaction_type': return row.transaction_type || '';
      case 'transaction_date': return new Date(row.transaction_date).getTime() || 0;
      default: return row[column];
    }
  };

  const va = mapValue(a);
  const vb = mapValue(b);

  if (typeof va === 'number' && typeof vb === 'number') {
    return (va - vb) * dir;
  }

  // Handle strings and others
  return String(va).localeCompare(String(vb)) * dir;
}

// Type filter
function initTypeFilter() {
  const btn = document.querySelector('.apply-filters-btn');
  const sel = document.getElementById('typeFilterTrans');
  const apply = () => {
    const val = (sel?.value || '').trim();
    if (val) {
      FILTERED_DATA = TXN_DATA.filter(tx => String(tx.transaction_type || '').toLowerCase() === val.toLowerCase());
    } else {
      FILTERED_DATA = [...TXN_DATA];
    }
    // Re-apply current sort if any
    if (currentSort.column) {
      FILTERED_DATA = [...FILTERED_DATA].sort((a, b) => compareByColumn(a, b, currentSort.column, currentSort.direction));
    }
    renderTransactions(FILTERED_DATA);
  };
  if (btn) btn.addEventListener('click', apply);
  if (sel) sel.addEventListener('change', apply);
}

// Show modal with transaction details
function showDetails(tx) {
  if (!tx) return;

  document.getElementById("modalRef").textContent = tx.reference_number || "N/A";
  document.getElementById("modalUser").textContent = tx.users?.username || "N/A";
  document.getElementById("modalStore").textContent = tx.stores?.store_name || "N/A";
  document.getElementById("modalProduct").textContent = tx.products?.product_name || "N/A";
  document.getElementById("modalQty").textContent = tx.quantity ?? 0;
  const priceNum = Number(tx.price || 0);
  const amountNum = Number(tx.quantity) * priceNum;
  document.getElementById("modalPrice").textContent = `₱${isFinite(priceNum) ? priceNum.toFixed(2) : "0.00"}`;
  document.getElementById("modalAmount").textContent = `₱${isFinite(amountNum) ? amountNum.toFixed(2) : "0.00"}`;
  document.getElementById("modalPoints").textContent = tx.points ?? 0;
  document.getElementById("modalType").textContent = tx.transaction_type || "N/A";
  document.getElementById("modalDate").textContent = new Date(tx.transaction_date).toLocaleString();

  // Show modal
  const modal = document.getElementById("detailsModal");
  // ensure starts hidden to avoid random open on load
  modal.style.display = "";
  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

// Close modal when clicking close button
function closeModal() {
  const modal = document.getElementById("detailsModal");
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = "none";
  }
  document.body.classList.remove('modal-open');
}

function initModalHandlers() {
  const closeBtn = document.querySelector(".receipt-header .close");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  // Close on outside click
  window.addEventListener("click", (e) => {
    const modal = document.getElementById("detailsModal");
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById("detailsModal");
      if (modal && modal.style.display === 'block') {
        closeModal();
      }
    }
  });
}

// removed duplicate outside click handlers in favor of initModalHandlers()
