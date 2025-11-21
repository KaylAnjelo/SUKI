// Promotion form handler for owner modal

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('promotionForm');
  if (!form) return;

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const type = document.getElementById('discountType').value;
    const storeId = document.getElementById('promoStoreSelect')?.value;
    const name = document.getElementById('promotionName').value;
    const description = document.getElementById('description').value;
    const points = document.getElementById('points').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    let payload = {
      store_id: storeId,
      reward_name: name,
      description,
      points_required: points,
      start_date: startDate,
      end_date: endDate,
      reward_type: '',
      discount_value: null,
      free_item_product_id: null,
      buy_x_quantity: null,
      buy_x_product_id: null,
      get_y_quantity: null,
      get_y_product_id: null
    };

    if (type === 'discount') {
      payload.reward_type = 'Discount';
      payload.discount_value = document.getElementById('discountValue').value || document.getElementById('discountPercentage').value;
    } else if (type === 'free') {
      payload.reward_type = 'Free Item';
      payload.free_item_product_id = document.getElementById('selectedProduct').value;
    } else if (type === 'buy_x_get_y') {
      payload.reward_type = 'Buy X Get Y';
      payload.buy_x_quantity = document.getElementById('buyQuantity').value;
      payload.buy_x_product_id = document.getElementById('buyProduct').value;
      payload.get_y_quantity = document.getElementById('getQuantity').value;
      payload.get_y_product_id = document.getElementById('getProduct').value;
    }

    // Always send all type-specific fields for update, even if null/empty
    // This ensures backend can clear previous values when changing type

    // Determine if this is an update or create
    const promotionId = form.dataset.editId;
    const method = promotionId ? 'PUT' : 'POST';
    const url = promotionId ? `/api/owner/promotions/${promotionId}` : '/api/owner/promotions';

    // Send to backend
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (res.ok) {
        showNotification('Promotion saved!', 'success');
        closePromotionModal();
        // Optionally reload promotions list
        if (typeof loadPromotions === 'function') loadPromotions();
      } else {
        showNotification(result.error || 'Failed to save promotion', 'error');
      }
    } catch (err) {
      showNotification('Server error saving promotion', 'error');
    }
  });
});

// Helper notification function
function showNotification(message, type = 'info') {
  // ...existing code for notification...
}

// Helper to close modal
function closePromotionModal() {
  document.getElementById('promotionModal').style.display = 'none';
  document.body.classList.remove('modal-open');
}
