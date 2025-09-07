const addStoreModal = document.getElementById('addStoreModal');

// Show modal
function showAddStoreForm() {
  addStoreModal.style.display = 'flex';
  setTimeout(() => addStoreModal.classList.add('show'), 10);
}

// Close modal
function closeModal() {
  addStoreModal.classList.remove('show');
  setTimeout(() => {
    addStoreModal.style.display = 'none';
  }, 300);
}

// Close modal when clicking outside
window.onclick = function(event) {
  if (event.target === addStoreModal) {
    closeModal();
  }
};

// Confirm deletion
function confirmDelete(form) {
  return confirm('Are you sure you want to delete this store? This action cannot be undone.');
}

// Handle form submission
document.addEventListener("DOMContentLoaded", () => {
  const addStoreForm = addStoreModal.querySelector('form');

  if (addStoreForm) {
    addStoreForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const formData = new FormData(addStoreForm);
      const submitBtn = addStoreForm.querySelector('.submit-btn');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Adding...';
      submitBtn.disabled = true;

      try {
        const response = await fetch(addStoreForm.action, {
          method: addStoreForm.method,
          body: formData
        });

        if (response.ok) {
          alert('Store added successfully!');
          closeModal();
          addStoreForm.reset();
          window.location.reload();
        } else {
          const errorText = await response.text();
          alert(`Failed to add store. ${errorText}`);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }
});