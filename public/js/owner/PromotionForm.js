// Promotion form handler for owner modal

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('promotionForm');
  if (!form) return;

  form.addEventListener('submit', async function(e) {
    // Prevent other inline/legacy handlers from interfering
    e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    const type = document.getElementById('rewardType').value;
    const storeId = document.getElementById('promoStoreSelect')?.value;
    const name = document.getElementById('promotionName').value;
    const description = document.getElementById('description').value;
    const points = document.getElementById('points').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    // Build payload before sending
    let payload = {
      store_id: storeId,
      reward_name: name,
      description,
      points_required: points,
      start_date: startDate,
      end_date: endDate,
      reward_type: '',
    };

    if (type === 'discount') {
      payload.reward_type = 'Discount';
      payload.discount_value = document.getElementById('discountValue').value;
    } else if (type === 'free_item') {
      payload.reward_type = 'Free Item';
      payload.free_item_product_id = document.getElementById('freeItemProduct').value;
    } else if (type === 'buy_x_get_y') {
      payload.reward_type = 'Buy X Get Y';
      payload.buy_x_quantity = document.getElementById('buyXQuantity').value;
      payload.buy_x_product_id = document.getElementById('buyXProduct').value;
      payload.get_y_quantity = document.getElementById('getYQuantity').value;
      payload.get_y_product_id = document.getElementById('getYProduct').value;
    }

    // Remove unused fields for clarity
    if (payload.reward_type !== 'Discount') delete payload.discount_value;
    if (payload.reward_type !== 'Free Item') delete payload.free_item_product_id;
    if (payload.reward_type !== 'Buy X Get Y') {
      delete payload.buy_x_quantity;
      delete payload.buy_x_product_id;
      delete payload.get_y_quantity;
      delete payload.get_y_product_id;
    }

    // Debug log to verify payload before sending
    console.log('Promotion payload to backend:', payload);

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
  }, { capture: true });

  // Expose modal helpers globally so the inline HBS markup can call them
  window.closePromotionModal = function() {
    const modal = document.getElementById('promotionModal');
    if (modal) modal.style.display = 'none';
    // Reset form and clear edit id
    if (form) {
      form.reset();
      delete form.dataset.editId;
    }
  };

  window.openPromotionModal = function() {
    const modal = document.getElementById('promotionModal');
    if (modal) modal.style.display = 'flex';
    // Ensure dynamic selectors are initialized
    if (typeof initializeStoreSelector === 'function') initializeStoreSelector();
    if (typeof setupDiscountUnit === 'function') setupDiscountUnit();
  };

  // Fetch promotion by id and populate the modal for editing
  window.editPromotion = async function(promotionId) {
    try {
      const res = await fetch(`/api/owner/promotions/${promotionId}`);
      const data = await res.json();
      if (!res.ok) {
        console.error('Failed to fetch promotion for edit:', data.error || data);
        return;
      }

      const promo = data.promotion;
      if (!promo) return;

      // Open modal and set edit id
      openPromotionModal();
      form.dataset.editId = promotionId;

      // Populate basic fields safely
      document.getElementById('promotionName')?.value = promo.reward_name || '';
      document.getElementById('description')?.value = promo.description || '';
      document.getElementById('points')?.value = promo.points_required || '';
      if (promo.start_date) document.getElementById('startDate')?.value = (new Date(promo.start_date)).toISOString().split('T')[0];
      if (promo.end_date) document.getElementById('endDate')?.value = (new Date(promo.end_date)).toISOString().split('T')[0];

      // Store selector
      if (promo.store_id && document.getElementById('promoStoreSelect')) {
        document.getElementById('promoStoreSelect').value = promo.store_id;
      }

      // Map reward_type to frontend select values
      const rt = (promo.reward_type || '').toLowerCase();
      let frontendType = '';
      if (rt.includes('discount')) frontendType = 'discount';
      else if (rt.includes('free')) frontendType = 'free_item';
      else if (rt.includes('buy')) frontendType = 'buy_x_get_y';
      if (frontendType) document.getElementById('rewardType')?.value = frontendType;

      // Populate type-specific fields. Ensure product dropdowns are loaded first.
      if (frontendType === 'free_item') {
        if (typeof loadProducts === 'function') await loadProducts();
        if (promo.free_item_product_id) document.getElementById('freeItemProduct')?.value = promo.free_item_product_id;
      } else if (frontendType === 'buy_x_get_y') {
        if (typeof loadProductsForBuyXGetY === 'function') await loadProductsForBuyXGetY();
        if (promo.buy_x_quantity) document.getElementById('buyXQuantity')?.value = promo.buy_x_quantity;
        if (promo.get_y_quantity) document.getElementById('getYQuantity')?.value = promo.get_y_quantity;
        if (promo.buy_x_product_id) document.getElementById('buyXProduct')?.value = promo.buy_x_product_id;
        if (promo.get_y_product_id) document.getElementById('getYProduct')?.value = promo.get_y_product_id;
      } else if (frontendType === 'discount') {
        document.getElementById('discountValue')?.value = promo.discount_value || '';
      }

      // Update generated description if helpers exist
      if (typeof updateFreeItemDescription === 'function') updateFreeItemDescription();
      if (typeof updateBuyXGetYDescription === 'function') updateBuyXGetYDescription();

    } catch (err) {
      console.error('Error loading promotion for edit:', err);
    }
  };
});
