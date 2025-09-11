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

function onImageSelected(event) {
  const file = event.target.files && event.target.files[0];
  const preview = document.getElementById('imagePreview');
  const fileName = document.getElementById('fileName');
  if (!file) {
    preview.innerHTML = '<i class="fas fa-image" style="font-size:48px;color:#c7c7c7;"></i>';
    fileName.textContent = 'No file chosen';
    return;
  }
  fileName.textContent = file.name;
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  img.onload = () => URL.revokeObjectURL(img.src);
  preview.innerHTML = '';
  preview.appendChild(img);
}

function nextStep(step) {
  // Switch form steps
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + step).classList.add('active');

  // Update progress
  document.querySelectorAll('.progress-step').forEach(s => s.classList.remove('active'));
  for (let i = 1; i <= step; i++) {
    document.getElementById('progress-step-' + i).classList.add('active');
  }
}


function deleteStore(event, form) {
  event.preventDefault();
  const storeId = form.getAttribute('data-store-id');
  if (!storeId) {
    alert('Store ID not found!');
    return false;
  }
  if (!confirm('Are you sure you want to delete this store?')) return false;

  fetch(`/users/stores/delete/${storeId}`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' }
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        // Remove the row or reload
        form.closest('tr').remove();
      } else {
        alert('Failed to delete store: ' + (data.message || 'Unknown error'));
      }
    })
    .catch(err => {
      alert('Error deleting store.');
    });

  return false;
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