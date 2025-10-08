let TXN_DATA = [];
let FILTERED_DATA = [];
let OWNER_STORES = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load owner's stores for filtering
    await loadOwnerStores();
    
    // Load transactions
    const response = await fetch("/api/owner/transactions");
    TXN_DATA = await response.json();
    FILTERED_DATA = [...TXN_DATA];
    renderTransactions(FILTERED_DATA);
    initSorting();
    initModalHandlers();
    initTypeFilter();
    initStoreFilter();
  } catch (err) {
    console.error("Error loading owner transactions:", err);
  }
});

async function loadOwnerStores() {
  try {
    const response = await fetch("/api/owner/stores");
    OWNER_STORES = await response.json();
    
    const storeFilter = document.getElementById("storeFilter");
    storeFilter.innerHTML = '<option value="">All Stores</option>';
    
    OWNER_STORES.forEach(store => {
      const option = document.createElement("option");
      option.value = store.store_id;
      option.textContent = store.store_name;
      storeFilter.appendChild(option);
    });
  } catch (err) {
    console.error("Error loading owner stores:", err);
  }
}

function renderTransactions(rows) {
  const tbody = document.getElementById("transactionsBody");
  tbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 20px; color: #666;">
          No transactions found for your stores.
        </td>
      </tr>
    `;
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");
    const totalAmount = (row.quantity * row.price).toFixed(2);
    const formattedDate = new Date(row.transaction_date).toLocaleDateString();
    
    tr.innerHTML = `
      <td>${row.reference_number || 'N/A'}</td>
      <td>${row.stores?.store_name || 'Unknown Store'}</td>
      <td>₱${totalAmount}</td>
      <td>${row.points || 0}</td>
      <td>
        <span class="transaction-type ${row.transaction_type.toLowerCase()}">
          ${row.transaction_type}
        </span>
      </td>
      <td>${formattedDate}</td>
      <td>
        <button class="details-btn" onclick="showDetails(${row.id})">
          <i class="fas fa-eye"></i> View
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function initSorting() {
  const headers = document.querySelectorAll("th[data-column]");
  headers.forEach(header => {
    if (header.classList.contains("sortable")) {
      header.style.cursor = "pointer";
      header.addEventListener("click", () => {
        const column = header.getAttribute("data-column");
        sortData(column);
      });
    }
  });
}

function sortData(column) {
  FILTERED_DATA.sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];
    
    // Handle nested objects
    if (column === 'store_name') {
      aVal = a.stores?.store_name || '';
      bVal = b.stores?.store_name || '';
    }
    
    // Handle dates
    if (column === 'transaction_date') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    }
    
    // Handle numbers
    if (column === 'amount') {
      aVal = a.quantity * a.price;
      bVal = b.quantity * b.price;
    }
    
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return 0;
  });
  
  renderTransactions(FILTERED_DATA);
}

function initModalHandlers() {
  // Close modal when clicking outside
  window.addEventListener("click", (event) => {
    const modal = document.getElementById("detailsModal");
    if (event.target === modal) {
      closeModal();
    }
  });
}

function initTypeFilter() {
  const typeFilter = document.getElementById("typeFilterTrans");
  const applyBtn = document.querySelector(".apply-filters-btn");
  
  applyBtn.addEventListener("click", () => {
    applyFilters();
  });
  
  typeFilter.addEventListener("change", () => {
    applyFilters();
  });
}

function initStoreFilter() {
  const storeFilter = document.getElementById("storeFilter");
  
  storeFilter.addEventListener("change", () => {
    applyFilters();
  });
}

function applyFilters() {
  const typeFilter = document.getElementById("typeFilterTrans").value;
  const storeFilter = document.getElementById("storeFilter").value;
  
  FILTERED_DATA = TXN_DATA.filter(row => {
    const typeMatch = !typeFilter || row.transaction_type === typeFilter;
    const storeMatch = !storeFilter || row.store_id == storeFilter;
    
    return typeMatch && storeMatch;
  });
  
  renderTransactions(FILTERED_DATA);
}

async function showDetails(transactionId) {
  try {
    const response = await fetch(`/api/owner/transactions/${transactionId}`);
    const transaction = await response.json();
    
    if (response.ok) {
      displayTransactionDetails(transaction);
    } else {
      console.error("Error fetching transaction details:", transaction.error);
      alert("Error loading transaction details");
    }
  } catch (err) {
    console.error("Error fetching transaction details:", err);
    alert("Error loading transaction details");
  }
}

function displayTransactionDetails(transaction) {
  const modal = document.getElementById("detailsModal");
  
  // Populate modal with transaction data
  document.getElementById("modalRef").textContent = transaction.reference_number || 'N/A';
  document.getElementById("modalUser").textContent = transaction.users?.username || 'Guest';
  document.getElementById("modalStore").textContent = transaction.stores?.store_name || 'Unknown Store';
  document.getElementById("modalProduct").textContent = transaction.products?.product_name || 'Unknown Product';
  document.getElementById("modalQty").textContent = transaction.quantity;
  document.getElementById("modalPrice").textContent = `₱${transaction.price.toFixed(2)}`;
  document.getElementById("modalType").textContent = transaction.transaction_type;
  document.getElementById("modalDate").textContent = new Date(transaction.transaction_date).toLocaleString();
  
  const totalAmount = (transaction.quantity * transaction.price).toFixed(2);
  document.getElementById("modalAmount").textContent = `₱${totalAmount}`;
  document.getElementById("modalPoints").textContent = transaction.points || 0;
  
  modal.style.display = "block";
}

function closeModal() {
  const modal = document.getElementById("detailsModal");
  modal.style.display = "none";
}
