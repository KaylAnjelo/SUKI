// Owner Redemptions Management JavaScript

document.addEventListener('DOMContentLoaded', function() {
  const redemptionsBody = document.getElementById('redemptionsBody');
  const storeFilter = document.getElementById('storeFilter');
  const statusFilter = document.getElementById('statusFilter');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');
  const applyFilters = document.getElementById('applyFilters');
  const detailsModal = document.getElementById('detailsModal');

  let redemptions = [];
  let filteredRedemptions = [];
  let currentSort = { column: null, direction: 'asc' };

  // Initialize
  loadStores();
  loadRedemptions();
  setupEventListeners();

  // Load stores for filter dropdown
  async function loadStores() {
    try {
      const response = await fetch('/api/owner/stores');
      const stores = await response.json();
      
      storeFilter.innerHTML = '<option value="">All Stores</option>';
      stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store.store_id;
        option.textContent = store.store_name;
        storeFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading stores:', error);
    }
  }

  // Load redemptions data
  async function loadRedemptions() {
    try {
      const response = await fetch('/api/owner/redemptions');
      const data = await response.json();
      
      if (response.ok) {
        redemptions = data;
        filteredRedemptions = [...redemptions];
        renderRedemptions();
      } else {
        console.error('Error loading redemptions:', data.error);
        showNotification('Error loading redemptions', 'error');
      }
    } catch (error) {
      console.error('Error loading redemptions:', error);
      showNotification('Error loading redemptions', 'error');
    }
  }

  // Render redemptions table
  function renderRedemptions() {
    if (filteredRedemptions.length === 0) {
      redemptionsBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 40px; color: #666;">
            <i class="fas fa-gift" style="font-size: 48px; color: #ddd; margin-bottom: 16px; display: block;"></i>
            <h3>No redemptions found</h3>
            <p>No redemptions match your current filters.</p>
          </td>
        </tr>
      `;
      return;
    }

    redemptionsBody.innerHTML = filteredRedemptions.map(redemption => `
      <tr>
        <td>${redemption.redemption_id || 'N/A'}</td>
        <td>${redemption.customer_name || 'N/A'}</td>
        <td>${redemption.store_name || 'N/A'}</td>
        <td>${redemption.reward_name || 'N/A'}</td>
        <td>${formatPoints(redemption.points_used)}</td>
        <td>${getStatusBadge(redemption.status)}</td>
        <td>${formatDate(redemption.redemption_date)}</td>
        <td>
          <button class="details-btn" onclick="showRedemptionDetails('${redemption.redemption_id}')" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Setup event listeners
  function setupEventListeners() {
    applyFilters.addEventListener('click', applyFiltersHandler);
    
    // Store filter change
    storeFilter.addEventListener('change', applyFiltersHandler);
    statusFilter.addEventListener('change', applyFiltersHandler);
    dateFrom.addEventListener('change', applyFiltersHandler);
    dateTo.addEventListener('change', applyFiltersHandler);

    // Table sorting
    document.querySelectorAll('th.sortable').forEach(header => {
      header.addEventListener('click', () => {
        const column = header.dataset.column;
        sortTable(column);
      });
    });

    // Modal close
    document.querySelector('.close').addEventListener('click', closeModal);
    detailsModal.addEventListener('click', (e) => {
      if (e.target === detailsModal) {
        closeModal();
      }
    });
  }

  // Apply filters
  function applyFiltersHandler() {
    const storeId = storeFilter.value;
    const status = statusFilter.value;
    const fromDate = dateFrom.value;
    const toDate = dateTo.value;

    filteredRedemptions = redemptions.filter(redemption => {
      let matches = true;

      if (storeId && redemption.store_id !== storeId) {
        matches = false;
      }

      if (status && redemption.status !== status) {
        matches = false;
      }

      if (fromDate && new Date(redemption.redemption_date) < new Date(fromDate)) {
        matches = false;
      }

      if (toDate && new Date(redemption.redemption_date) > new Date(toDate)) {
        matches = false;
      }

      return matches;
    });

    renderRedemptions();
  }

  // Sort table
  function sortTable(column) {
    const direction = currentSort.column === column && currentSort.direction === 'asc' ? 'desc' : 'asc';
    
    filteredRedemptions.sort((a, b) => {
      let aVal = a[column];
      let bVal = b[column];

      // Handle different data types
      if (column.includes('date')) {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      } else if (column.includes('points')) {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    currentSort = { column, direction };
    updateSortIndicators();
    renderRedemptions();
  }

  // Update sort indicators
  function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach(header => {
      header.classList.remove('asc', 'desc');
      if (header.dataset.column === currentSort.column) {
        header.classList.add(currentSort.direction);
      }
    });
  }

  // Show redemption details modal
  window.showRedemptionDetails = function(redemptionId) {
    const redemption = redemptions.find(r => r.redemption_id === redemptionId);
    if (!redemption) return;

    // Populate modal with redemption data
    document.getElementById('modalRef').textContent = `#${redemption.redemption_id}`;
    document.getElementById('modalCustomer').textContent = redemption.customer_name || 'N/A';
    document.getElementById('modalStore').textContent = redemption.store_name || 'N/A';
    document.getElementById('modalReward').textContent = redemption.reward_name || 'N/A';
    document.getElementById('modalDescription').textContent = redemption.description || 'No description available';
    document.getElementById('modalStatus').innerHTML = getStatusBadge(redemption.status);
    document.getElementById('modalDate').textContent = formatDate(redemption.redemption_date);
    document.getElementById('modalPoints').textContent = formatPoints(redemption.points_used);
    document.getElementById('modalBalance').textContent = formatPoints(redemption.customer_points_balance || 0);

    // Show modal
    detailsModal.style.display = 'flex';
    document.body.classList.add('modal-open');
  };

  // Close modal
  window.closeModal = function() {
    detailsModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };

  // Utility functions
  function formatPoints(points) {
    return points ? points.toLocaleString() + ' pts' : '0 pts';
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getStatusBadge(status) {
    const statusMap = {
      'completed': '<span class="status-success">Completed</span>',
      'pending': '<span class="status-pending">Pending</span>',
      'cancelled': '<span class="status-error">Cancelled</span>'
    };
    return statusMap[status] || `<span class="status-unknown">${status || 'Unknown'}</span>`;
  }

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
});
