// Owner Stores Management JavaScript

document.addEventListener('DOMContentLoaded', function() {
  const addStoreBtn = document.getElementById('addStoreBtn');
  const storeModal = document.getElementById('storeModal');
  const deleteModal = document.getElementById('deleteModal');
  const storeForm = document.getElementById('storeForm');
  const closeModal = document.getElementById('closeModal');
  const closeDeleteModal = document.getElementById('closeDeleteModal');
  const cancelBtn = document.getElementById('cancelBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const submitBtn = document.getElementById('submitBtn');
  const storeImage = document.getElementById('storeImage');
  const imagePreview = document.getElementById('imagePreview');
  const storesGrid = document.getElementById('storesGrid');

  let currentStoreId = null;
  let deleteStoreId = null;

  // Event Listeners
  addStoreBtn.addEventListener('click', openAddStoreModal);
  closeModal.addEventListener('click', closeStoreModal);
  closeDeleteModal.addEventListener('click', closeDeleteModalFunc);
  cancelBtn.addEventListener('click', closeStoreModal);
  cancelDeleteBtn.addEventListener('click', closeDeleteModalFunc);
  storeForm.addEventListener('submit', handleStoreSubmit);
  storeImage.addEventListener('change', handleImagePreview);

  // Open Add Store Modal
  function openAddStoreModal() {
    currentStoreId = null;
    document.getElementById('modalTitle').textContent = 'Add New Store';
    document.getElementById('storeForm').reset();
    document.getElementById('imagePreview').innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>Click to upload store image</span>';
    document.getElementById('submitBtn').textContent = 'Add Store';
    storeModal.style.display = 'flex';
  }

  // Close Store Modal
  function closeStoreModal() {
    storeModal.style.display = 'none';
    currentStoreId = null;
  }

  // Close Delete Modal
  function closeDeleteModalFunc() {
    deleteModal.style.display = 'none';
    deleteStoreId = null;
  }

  // Handle Image Preview
  function handleImagePreview(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Store Preview" style="max-width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px;">`;
      };
      reader.readAsDataURL(file);
    }
  }

  // Handle Store Form Submit
  async function handleStoreSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(storeForm);
    const isEdit = currentStoreId !== null;
    
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = isEdit ? 'Updating...' : 'Adding...';

      const url = isEdit ? `/api/owner/stores/${currentStoreId}` : '/api/owner/stores';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        showNotification(result.message || (isEdit ? 'Store updated successfully!' : 'Store added successfully!'), 'success');
        closeStoreModal();
        loadStores(); // Reload the stores list
      } else {
        showNotification(result.error || 'An error occurred', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showNotification('An error occurred while saving the store', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Update Store' : 'Add Store';
    }
  }

  // Load Stores
  async function loadStores() {
    try {
      const response = await fetch('/api/owner/stores');
      const stores = await response.json();
      
      if (stores.length === 0) {
        storesGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">
              <i class="fas fa-store"></i>
            </div>
            <h3>No stores found</h3>
            <p>You haven't added any stores yet. Click "Add New Store" to get started.</p>
          </div>
        `;
        return;
      }

      storesGrid.innerHTML = stores.map(store => `
        <div class="store-card" data-store-id="${store.store_id}">
          <div class="store-image-container">
            ${store.store_image ? 
              `<img src="${store.store_image}" alt="${store.store_name}" class="store-image">` :
              `<div class="store-image-placeholder"><i class="fas fa-store"></i></div>`
            }
            <div class="store-actions">
              <button class="action-btn edit-btn" data-store-id="${store.store_id}" title="Edit Store">
                <i class="fas fa-edit"></i>
              </button>
              <button class="action-btn delete-btn" data-store-id="${store.store_id}" title="Delete Store">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="store-info">
            <h3 class="store-name">${store.store_name}</h3>
            <p class="store-code">Code: ${store.store_code}</p>
            <p class="store-location">
              <i class="fas fa-map-marker-alt"></i>
              ${store.location}
            </p>
            <p class="store-contact">
              <i class="fas fa-phone"></i>
              ${store.owner_contact}
            </p>
            <div class="store-status">
              <span class="status-badge ${store.is_active ? 'active' : 'inactive'}">
                ${store.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      `).join('');

      // Add event listeners to the new buttons
      addStoreCardEventListeners();
    } catch (error) {
      console.error('Error loading stores:', error);
      showNotification('Error loading stores', 'error');
    }
  }

  // Add Event Listeners to Store Cards
  function addStoreCardEventListeners() {
    // Edit buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const storeId = e.target.closest('.edit-btn').dataset.storeId;
        editStore(storeId);
      });
    });

    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const storeId = e.target.closest('.delete-btn').dataset.storeId;
        deleteStore(storeId);
      });
    });
  }

  // Edit Store
  async function editStore(storeId) {
    try {
      const response = await fetch(`/api/owner/stores/${storeId}`);
      const store = await response.json();

      if (response.ok) {
        currentStoreId = storeId;
        document.getElementById('modalTitle').textContent = 'Edit Store';
        document.getElementById('storeName').value = store.store_name;
        document.getElementById('storeCode').value = store.store_code;
        document.getElementById('ownerContact').value = store.owner_contact;
        document.getElementById('location').value = store.location;
        document.getElementById('isActive').checked = store.is_active;

        if (store.store_image) {
          imagePreview.innerHTML = `<img src="${store.store_image}" alt="Store Preview" style="max-width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px;">`;
        } else {
          imagePreview.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>Click to upload store image</span>';
        }

        document.getElementById('submitBtn').textContent = 'Update Store';
        storeModal.style.display = 'flex';
      } else {
        showNotification('Error loading store details', 'error');
      }
    } catch (error) {
      console.error('Error loading store:', error);
      showNotification('Error loading store details', 'error');
    }
  }

  // Delete Store
  function deleteStore(storeId) {
    deleteStoreId = storeId;
    
    // Find the store card to show preview
    const storeCard = document.querySelector(`[data-store-id="${storeId}"]`);
    const storeName = storeCard.querySelector('.store-name').textContent;
    const storeImage = storeCard.querySelector('.store-image') || storeCard.querySelector('.store-image-placeholder');
    
    document.getElementById('deleteStorePreview').innerHTML = `
      <div class="store-preview-card">
        ${storeImage.outerHTML}
        <h4>${storeName}</h4>
      </div>
    `;
    
    deleteModal.style.display = 'flex';
  }

  // Confirm Delete
  document.getElementById('confirmDeleteBtn').addEventListener('click', async function() {
    if (!deleteStoreId) return;

    try {
      const response = await fetch(`/api/owner/stores/${deleteStoreId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (response.ok) {
        showNotification('Store deleted successfully!', 'success');
        closeDeleteModalFunc();
        loadStores();
      } else {
        showNotification(result.error || 'Error deleting store', 'error');
      }
    } catch (error) {
      console.error('Error deleting store:', error);
      showNotification('Error deleting store', 'error');
    }
  });

  // Show Notification
  function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
      </div>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);

    // Remove notification after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Close modals when clicking outside
  window.addEventListener('click', function(event) {
    if (event.target === storeModal) {
      closeStoreModal();
    }
    if (event.target === deleteModal) {
      closeDeleteModalFunc();
    }
  });

  // Initialize
  loadStores();
});
