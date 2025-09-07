// Store Modal Logic
function showAddStoreForm() {
  const modal = document.getElementById("addStoreModal");
  if (modal) {
    modal.style.display = "flex";
  }
}

function closeModal() {
  const modal = document.getElementById("addStoreModal");
  if (modal) {
    modal.style.display = "none";
  }
}

// Close modal when clicking outside
window.addEventListener("click", function (event) {
  const modal = document.getElementById("addStoreModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

// Delete Confirmation
function confirmDelete(form) {
  return confirm("Are you sure you want to delete this store?");
}

// Middle Name Toggle (if present in the form)
document.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("addMiddleNameBtn");
  const mid = document.getElementById("ownerMiddleName");
  if (btn && mid) {
    btn.addEventListener("click", function () {
      const hidden = mid.style.display === "none" || mid.style.display === "";
      mid.style.display = hidden ? "inline-block" : "none";
      btn.textContent = hidden ? "−" : "+";
      if (!hidden) mid.value = "";
    });
  }
});