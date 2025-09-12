document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("/transactions"); // Backend API
    const transactions = await response.json();

    const tbody = document.getElementById("transactionsBody");
    tbody.innerHTML = "";

    // Populate transactions table
    transactions.forEach(tx => {
      const tr = document.createElement("tr");

      const ref = tx.reference_number || "N/A";
      const userName = tx.users?.username || "N/A";
      const storeName = tx.stores?.store_name || "N/A";
      const productName = tx.products?.product_name || "N/A";
      const amount = (tx.quantity * tx.price).toFixed(2);
      const points = tx.points ?? 0;
      const type = tx.transaction_type;
      const date = new Date(tx.transaction_date).toLocaleString();

      tr.innerHTML = `
        <td>${ref}</td>
        <td>${userName}</td>
        <td>${storeName}</td>
        <td>₱${amount}</td>
        <td>${points}</td>
        <td>${type}</td>
        <td>${date}</td>
        <td>
          <button class="details-btn" data-id="${tx.id}">
            <i class="fas fa-info-circle"></i>
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Attach event listener for details buttons
    document.querySelectorAll(".details-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const transaction = transactions.find(t => t.id == id);
        showDetails(transaction);
      });
    });

  } catch (err) {
    console.error("Error loading transactions:", err);
  }
});

// Show modal with transaction details
function showDetails(tx) {
  if (!tx) return;

  document.getElementById("modalRef").textContent = tx.reference_number || "N/A";
  document.getElementById("modalUser").textContent = tx.users?.username || "N/A";
  document.getElementById("modalStore").textContent = tx.stores?.store_name || "N/A";
  document.getElementById("modalProduct").textContent = tx.products?.product_name || "N/A";
  document.getElementById("modalQty").textContent = tx.quantity ?? 0;
  document.getElementById("modalPrice").textContent = `₱${tx.price?.toFixed(2) || "0.00"}`;
  document.getElementById("modalAmount").textContent = `₱${(tx.quantity * tx.price).toFixed(2) || "0.00"}`;
  document.getElementById("modalPoints").textContent = tx.points ?? 0;
  document.getElementById("modalType").textContent = tx.transaction_type || "N/A";
  document.getElementById("modalDate").textContent = new Date(tx.transaction_date).toLocaleString();

  // Show modal
  document.getElementById("detailsModal").style.display = "block";
}

// Close modal when clicking close button
document.querySelector(".receipt-header .close").addEventListener("click", () => {
  document.getElementById("detailsModal").style.display = "none";
});

// Optional: Close modal when clicking outside the modal
window.addEventListener("click", (e) => {
  const modal = document.getElementById("detailsModal");
  if (e.target === modal) {
    modal.style.display = "none";
  }
});

// Close when clicking outside
window.addEventListener("click", (e) => {
  const modal = document.getElementById("detailsModal");
  const modalContent = modal.querySelector(".receipt-body");
  if (e.target === modal) { // clicked outside the white box
    modal.style.display = "none";
  }
});
