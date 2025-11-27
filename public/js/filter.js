const today = new Date().toISOString().split('T')[0];
// Track if filters were explicitly applied by the user
window.filtersApplied = false;

// Get date input elements
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const applyFiltersBtn = document.getElementById('applyFilters');

// Set initial values and constraints only if elements exist
if (endDateInput) {
  endDateInput.value = today;
  endDateInput.max = today;
}
if (startDateInput) {
  startDateInput.max = today;
}

// Set minimum date for start date (e.g., 1 year ago)
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
if (startDateInput) {
  startDateInput.min = oneYearAgo.toISOString().split('T')[0];
}

// Add event listeners for date validation
if (startDateInput) {
  startDateInput.addEventListener('change', validateDates);
}
if (endDateInput) {
  endDateInput.addEventListener('change', validateDates);
}

function validateDates() {
    if (!startDateInput || !endDateInput) return;
    
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);

    // Ensure start date is not after end date
    if (startDate > endDate) {
        startDateInput.value = endDateInput.value;
    }

    // Ensure end date is not before start date
    if (endDate < startDate) {
        endDateInput.value = startDateInput.value;
    }

    // Ensure dates are within valid range
    if (startDate < new Date(startDateInput.min)) {
        startDateInput.value = startDateInput.min;
    }
    if (endDate > new Date(endDateInput.max)) {
        endDateInput.value = endDateInput.max;
    }
}

// Function to update the table with filtered data
function updateTable(data) {
    // Use a generic renderer per page context
    const path = window.location.pathname || '';

    if (path.includes('/reports/sales')) {
        renderTable(
            data,
            '#salesTable',
            ['transaction_date', 'store_name', 'reference_number', 'products_sold', 'total_amount'],
            'No sales data available.'
        );
        return;
    }

    if (path.includes('/reports/transactions')) {
        renderTable(
            data,
            '#transactionsTable',
            ['date_time', 'user', 'transaction_type', 'transaction_id', 'amount', 'store_name', 'vendor', 'product_details'],
            'No transactions found.'
        );
        return;
    }

    if (path.includes('/reports/activity')) {
        renderTable(
            data,
            '#activityTable',
            ['date_time', 'user', 'activity_type', 'details', 'store_name', 'status'],
            'No activity found.'
        );
        return;
    }
}

// Function to apply filters
// markApplied: when true the global `window.filtersApplied` is set (used by export functions).
// Pass `false` when performing an automatic initial load so the UI isn't considered "filters applied".
async function applyFilters(markApplied = true) {
    // Mark that filters are now applied only when requested
    if (markApplied) window.filtersApplied = true;
    const startDateRaw = document.getElementById('startDate')?.value || '';
    const endDateRaw = document.getElementById('endDate')?.value || '';
    const storeRaw = document.getElementById('storeFilter')?.value || '';
    const customerRaw = document.getElementById('customerFilter')?.value || '';
    const vendorRaw = document.getElementById('vendorFilter')?.value || '';
    const activityTypeRaw = document.getElementById('activityType')?.value || '';
    const transactionTypeRaw = document.getElementById('transactionType')?.value || '';
    const sortOrderRaw = document.getElementById('sortOrder')?.value || '';

    // Normalize inputs
    const startDate = startDateRaw;
    const endDate = endDateRaw; // server expands end-of-day
    const store = storeRaw.trim(); // now a numeric/id string when present
    // send customer and vendor separately so backend can apply AND logic when both provided
    const customer = customerRaw.trim();
    const vendor = vendorRaw.trim();
    const normalizeType = (v) => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : '';
    const activityType = normalizeType(activityTypeRaw.trim());
    const transactionType = normalizeType(transactionTypeRaw.trim());
    const sortOrder = (sortOrderRaw === 'oldest' || sortOrderRaw === 'newest') ? sortOrderRaw : '';

    try {
        // Choose endpoint based on current page
        let endpoint = '/reports/sales/filter';
        const pathname = window.location.pathname || '';
        if (pathname.includes('/reports/activity')) {
            endpoint = '/reports/activity/filter';
        } else if (pathname.includes('/reports/transactions')) {
            endpoint = '/reports/transactions/filter';
        }

        // Prevent double submit
        if (applyFiltersBtn) applyFiltersBtn.disabled = true;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...(startDate ? { startDate } : {}),
                ...(endDate ? { endDate } : {}),
                ...(store ? { store } : {}),
                // send both customer and vendor separately; backend will decide how to combine
                ...(customer ? { customer } : {}),
                ...(vendor ? { vendor } : {}),
                ...(activityType ? { activityType } : {}),
                ...(transactionType ? { transactionType } : {}),
                ...(sortOrder ? { sortOrder } : {}),
            }),
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        // Debug: log server response for troubleshooting vendor filtering
        try { console.debug('Filter response data sample:', Array.isArray(data) ? data.slice(0,5) : data); } catch (e) {}
        
        // Initialize pagination with filtered data
        if (window.pagination) {
            window.pagination.init(Array.isArray(data) ? data : []);
        } else {
            updateTable(Array.isArray(data) ? data : []);
        }
    } catch (error) {
        console.error('Error applying filters:', error);
    } finally {
        if (applyFiltersBtn) applyFiltersBtn.disabled = false;
    }
}

// Helper function to format dates
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Generic table renderer used across pages
function renderTable(data, tableSelector, columns, emptyMessage) {
    const tbody = document.querySelector(`${tableSelector} tbody`) || document.querySelector('table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        const colspan = Array.isArray(columns) && columns.length > 0 ? columns.length : 1;
        tbody.innerHTML = `<tr><td colspan="${colspan}">${emptyMessage}</td></tr>`;
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');

        row.innerHTML = columns.map(col => {
            let value = item[col];

            // Format currency
            if (col.toLowerCase().includes('amount') || col.toLowerCase().includes('total')) {
                const numeric = parseFloat(value);
                value = isFinite(numeric) ? `₱${numeric.toFixed(2)}` : value;
            }

            // Format date
            if (col.toLowerCase().includes('date') && value) {
                value = formatDate(value);
            }

            // Status badge styling for activity if present
            if (col.toLowerCase() === 'status' && typeof value === 'string') {
                const css = value.toLowerCase();
                return `<td><span class="status-badge ${css}">${value}</span></td>`;
            }

            return `<td>${value || 'N/A'}</td>`;
        }).join('');

        tbody.appendChild(row);
    });
}

// Add event listener for filter button
document.addEventListener('DOMContentLoaded', function() {
    const applyFiltersBtn = document.getElementById('applyFilters');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', function() { applyFilters(true); });
    }
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearFilters);
    }
    // Perform an initial unmarked load so the table is visible before the user applies filters
    try { if (typeof applyFilters === 'function') applyFilters(false); } catch (e) {}
});

// Initial validation
validateDates();

// Replace fragile element access with guarded access
const dateFromEl = document.getElementById('dateFrom');
const dateToEl = document.getElementById('dateTo');
if (dateFromEl) dateFromEl.value = /* default or computed value */ '';
if (dateToEl) dateToEl.value = /* default or computed value */ '';

// Clear filters and reset view to initial data
async function clearFilters() {
    const start = document.getElementById('startDate');
    const end = document.getElementById('endDate');
    const store = document.getElementById('storeFilter');
    const sort = document.getElementById('sortOrder');
    const custSel = document.getElementById('customerFilter');
    const vendSel = document.getElementById('vendorFilter');
    const transactionTypeSel = document.getElementById('transactionType');
    const activityTypeSel = document.getElementById('activityType');

    if (start) {
        // Reset to empty so server treats as unbounded
        start.value = '';
    }
    if (end) {
        // Reset to today by default
        end.value = today;
    }
    if (store) {
        store.selectedIndex = 0;
    }
    if (sort) {
        sort.value = 'newest';
    }
    // Reset customer/vendor selects
    if (custSel) custSel.selectedIndex = 0;
    if (vendSel) vendSel.selectedIndex = 0;
    if (transactionTypeSel) transactionTypeSel.selectedIndex = 0;
    if (activityTypeSel) activityTypeSel.selectedIndex = 0;

    // Mark filters as not applied
    window.filtersApplied = false;

    // Reinitialize with original server-provided data if available
    const pathname = window.location.pathname || '';
    if (pathname.includes('/reports/sales')) {
        const data = (window.__initialSalesData && Array.isArray(window.__initialSalesData)) ? window.__initialSalesData : [];
        if (window.pagination) {
            window.pagination.init(data);
        } else {
            updateTable(data);
        }
    } else {
        // For transactions/activity pages, re-fetch unfiltered data and repopulate selects
        try {
            const pathname = window.location.pathname || '';

            if (pathname.includes('/reports/transactions')) {
                // repopulate customers, vendors and stores to their default/full lists
                try {
                    const [custRes, vendRes, storesRes] = await Promise.all([
                        fetch('/reports/transactions/users?role=customer'),
                        fetch('/reports/transactions/users?role=vendor'),
                        fetch('/reports/transactions/stores')
                    ]);

                    if (custRes && custRes.ok) {
                        const customers = await custRes.json();
                        if (custSel && Array.isArray(customers)) {
                            custSel.innerHTML = '<option value="">Customer</option>';
                            customers.forEach(u => {
                                const opt = document.createElement('option');
                                opt.value = u.user_id || u.username || '';
                                const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
                                opt.textContent = full || u.username || opt.value;
                                custSel.appendChild(opt);
                            });
                        }
                    }

                    if (vendRes && vendRes.ok) {
                        const vendors = await vendRes.json();
                        if (vendSel && Array.isArray(vendors)) {
                            vendSel.innerHTML = '<option value="">Vendor</option>';
                            vendors.forEach(u => {
                                const opt = document.createElement('option');
                                opt.value = u.user_id || u.username || '';
                                const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
                                opt.textContent = full || u.username || opt.value;
                                vendSel.appendChild(opt);
                            });
                        }
                    }

                    if (storesRes && storesRes.ok) {
                        const stores = await storesRes.json();
                        const storeSel = document.getElementById('storeFilter');
                        if (storeSel && Array.isArray(stores)) {
                            // reset options then append
                            storeSel.innerHTML = '<option value="">All Stores</option>';
                            stores.forEach(s => {
                                const opt = document.createElement('option');
                                if (s && typeof s === 'object') {
                                    opt.value = s.store_id || s.id || '';
                                    opt.textContent = s.store_name || s.name || opt.value;
                                } else {
                                    opt.value = s;
                                    opt.textContent = s;
                                }
                                storeSel.appendChild(opt);
                            });
                        }
                    }
                } catch (e) {
                    console.warn('Failed to repopulate users/stores after clearing filters:', e);
                }
            } else if (pathname.includes('/reports/activity')) {
                // repopulate activity users (and stores)
                try {
                    const [custRes, vendRes, storesRes] = await Promise.all([
                        fetch('/reports/activity/users?role=customer'),
                        fetch('/reports/activity/users?role=vendor'),
                        fetch('/reports/transactions/stores')
                    ]);

                    if (custRes && custRes.ok) {
                        const customers = await custRes.json();
                        if (custSel && Array.isArray(customers)) {
                            custSel.innerHTML = '<option value="">Customer</option>';
                            customers.forEach(u => {
                                const opt = document.createElement('option');
                                opt.value = u.user_id || u.username || '';
                                const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
                                opt.textContent = full || u.username || opt.value;
                                custSel.appendChild(opt);
                            });
                        }
                    }

                    if (vendRes && vendRes.ok) {
                        const vendors = await vendRes.json();
                        if (vendSel && Array.isArray(vendors)) {
                            vendSel.innerHTML = '<option value="">Vendor</option>';
                            vendors.forEach(u => {
                                const opt = document.createElement('option');
                                opt.value = u.user_id || u.username || '';
                                const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
                                opt.textContent = full || u.username || opt.value;
                                vendSel.appendChild(opt);
                            });
                        }
                    }

                    if (storesRes && storesRes.ok) {
                        const stores = await storesRes.json();
                        const storeSel = document.getElementById('storeFilter');
                        if (storeSel && Array.isArray(stores)) {
                            // reset options then append
                            storeSel.innerHTML = '<option value="">All Stores</option>';
                            stores.forEach(s => {
                                const opt = document.createElement('option');
                                if (s && typeof s === 'object') {
                                    opt.value = s.store_id || s.id || '';
                                    opt.textContent = s.store_name || s.name || opt.value;
                                } else {
                                    opt.value = s;
                                    opt.textContent = s;
                                }
                                storeSel.appendChild(opt);
                            });
                        }
                    }
                } catch (e) {
                    console.warn('Failed to repopulate activity users/stores after clearing filters:', e);
                }
            }

            // ensure applyFilters uses current (now reset) inputs to load unfiltered results
            if (typeof applyFilters === 'function') await applyFilters();
        } catch (e) {
            console.error('Failed to re-fetch data after clearing filters:', e);
        }
    }
}

// Expose to global scope for inline onclick handlers
window.clearFilters = clearFilters;