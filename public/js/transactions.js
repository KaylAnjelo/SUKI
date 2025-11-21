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
    const storeName = tx.store || "N/A";
    const amount = tx.total?.toFixed(2) || "0.00";
    // Points: 10% of total amount, with decimals
    let points = Number(tx.total || 0) * 0.10;
    points = points % 1 === 0 ? points.toFixed(0) : points.toFixed(2);
    // If redemption, show the actual points used (tx.points_used or tx.points)
    let pointsDisplay = points;
    if ((tx.transaction_type || '').toLowerCase() === 'redemption') {
      pointsDisplay = tx.points_used !== undefined ? tx.points_used : (tx.points !== undefined ? tx.points : points);
    }
    const type = tx.transaction_type || "";
    const date = new Date(tx.transaction_date).toLocaleString();

    tr.innerHTML = `
      <td>${ref}</td>
      <td>${storeName}</td>
      <td>₱${amount}</td>
      <td>${pointsDisplay}</td>
      <td>${type}</td>
      <td>${date}</td>
      <td>
        <button class="details-btn" title="View details" data-ref="${tx.reference_number}">
          <i class="fas fa-receipt"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach modal button listeners
  document.querySelectorAll(".details-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const ref = e.currentTarget.getAttribute("data-ref");
      const transaction = FILTERED_DATA.find(t => t.reference_number === ref);
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
  const clearBtn = document.querySelector('.clear-filters-btn');
  const sel = document.getElementById('typeFilterTrans');
  const storeSel = document.getElementById('storeFilter');
  const dateStart = document.getElementById('dateStart');
  const dateEnd = document.getElementById('dateEnd');
  const amountSort = document.getElementById('amountSort');

  const apply = () => {
    let filtered = [...TXN_DATA];
    // Transaction type
    const typeVal = (sel?.value || '').trim();
    if (typeVal) {
      filtered = filtered.filter(tx => String(tx.transaction_type || '').toLowerCase() === typeVal.toLowerCase());
    }
    // Store filter
    const storeVal = (storeSel?.value || '').trim().toLowerCase();
    if (storeVal) {
      filtered = filtered.filter(tx => {
        // Support both store name and store id
        const storeName = String(tx.store || '').trim().toLowerCase();
        const storeId = String(tx.store_id || '').trim().toLowerCase();
        return storeName === storeVal || storeId === storeVal;
      });
    }
    // Date range
    const startVal = dateStart?.value;
    const endVal = dateEnd?.value;
    if (startVal) {
      filtered = filtered.filter(tx => new Date(tx.transaction_date) >= new Date(startVal));
    }
    if (endVal) {
      filtered = filtered.filter(tx => new Date(tx.transaction_date) <= new Date(endVal));
    }
    // Amount sort
    if (amountSort?.value === 'asc') {
      filtered = filtered.sort((a, b) => (a.total || 0) - (b.total || 0));
    } else {
      filtered = filtered.sort((a, b) => (b.total || 0) - (a.total || 0));
    }
    FILTERED_DATA = filtered;
    renderTransactions(FILTERED_DATA);
  };

  const clear = () => {
    if (sel) sel.value = '';
    if (storeSel) storeSel.value = '';
    if (dateStart) dateStart.value = '';
    if (dateEnd) dateEnd.value = '';
    if (amountSort) amountSort.value = 'desc';
    FILTERED_DATA = [...TXN_DATA];
    renderTransactions(FILTERED_DATA);
  };

  if (btn) btn.addEventListener('click', apply);
  if (clearBtn) clearBtn.addEventListener('click', clear);
}

// Show modal with transaction details
// 🪟 Show modal
function showDetails(tx) {
  if (!tx) return;

  const modal = document.getElementById("detailsModal");
  if (!modal) return console.error("Modal not found in DOM");

  // Helper: safely set text
  const safeText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
    else console.warn(`⚠️ Element with id "${id}" not found`);
  };

  // Basic fields
  safeText("modalRef", tx.reference_number || "N/A");
  safeText("modalType", tx.transaction_type || "N/A");
  safeText("modalDate", new Date(tx.transaction_date).toLocaleString());
  // Calculate points as 10% of total amount
  let points = (Number(tx.total || 0) * 0.10).toFixed(2);
  // If redemption, show the actual points used (tx.points_used or tx.points)
  let pointsDisplay = points;
  if ((tx.transaction_type || '').toLowerCase() === 'redemption') {
    pointsDisplay = tx.points_used !== undefined ? tx.points_used : (tx.points !== undefined ? tx.points : points);
  }
  safeText("modalPoints", pointsDisplay);

  // Dynamic product list
  const productSection = modal.querySelector(".receipt-info");
  if (productSection) {
    const productList = (tx.items || [])
      .map(item => `
        <div class="info-row">
          <span class="label">Product:</span>
          <span class="value">${item.product_name}</span>
        </div>
        <div class="info-row">
          <span class="label">Quantity:</span>
          <span class="value">${item.quantity}</span>
        </div>
        <div class="info-row">
          <span class="label">Price:</span>
          <span class="value">₱${Number(item.price).toFixed(2)}</span>
        </div>
        <div class="info-row">
          <span class="label">Subtotal:</span>
          <span class="value">₱${Number(item.subtotal).toFixed(2)}</span>
        </div>
        <hr>
      `).join("");

    productSection.innerHTML = `
      <div class="info-row">
        <span class="label">User:</span>
        <span class="value">${tx.user || "N/A"}</span>
      </div>
      <div class="info-row">
        <span class="label">Store:</span>
        <span class="value">${tx.store || "N/A"}</span>
      </div>
      ${productList || "<p>No products found</p>"}
    `;
  }

  safeText("modalAmount", `₱${Number(tx.total || 0).toFixed(2)}`);

  // Open modal
  modal.style.display = "flex"; // show modal visually
  modal.classList.add("open");
  document.body.classList.add("modal-open");
}

// Close modal handler
function closeModal() {
  const modal = document.getElementById("detailsModal");
  if (modal) {
    modal.classList.remove("open");
    setTimeout(() => {
      modal.style.display = "none";
      document.body.classList.remove("modal-open");
    }, 300); // Match the CSS transition duration
  }
}

// Attach close handler to modal exit button
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
      if (modal && modal.classList.contains("open")) {
        closeModal();
      }
    }
  });
}

// 🛠️ Debugging: Log transaction data
function debugLogTransactions(data) {
  console.log("Transaction Data:", JSON.stringify(data, null, 2));
}

// Optionally call this function after fetching transactions
document.addEventListener("DOMContentLoaded", () => {
  debugLogTransactions(TXN_DATA);
});
