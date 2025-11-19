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
            ['date_time', 'user', 'transaction_type', 'transaction_id', 'amount', 'store_name', 'product_details'],
            'No transactions found.'
        );
        return;
    }

    if (path.includes('/reports/activity')) {
        renderTable(
            data,
            'table',
            ['date_time', 'user', 'activity_type', 'details', 'status'],
            'No activity found.'
        );
        return;
    }
}

// Function to apply filters
async function applyFilters() {
    // Mark that filters are now applied
    window.filtersApplied = true;
    const startDateRaw = document.getElementById('startDate')?.value || '';
    const endDateRaw = document.getElementById('endDate')?.value || '';
    const storeRaw = document.getElementById('storeFilter')?.value || '';
    const userRaw = document.getElementById('userFilter')?.value || '';
    const activityTypeRaw = document.getElementById('activityType')?.value || '';
    const transactionTypeRaw = document.getElementById('transactionType')?.value || '';
    const sortOrderRaw = document.getElementById('sortOrder')?.value || '';

    // Normalize inputs
    const startDate = startDateRaw;
    const endDate = endDateRaw; // server expands end-of-day
    const store = storeRaw.trim(); // now a numeric/id string when present
    const user = userRaw.trim();
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
                ...(user ? { user } : {}),
                ...(activityType ? { activityType } : {}),
                ...(transactionType ? { transactionType } : {}),
                ...(sortOrder ? { sortOrder } : {}),
            }),
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        
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
        applyFiltersBtn.addEventListener('click', applyFilters);
    }
});

// Initial validation
validateDates();

// Replace fragile element access with guarded access
const dateFromEl = document.getElementById('dateFrom');
const dateToEl = document.getElementById('dateTo');
if (dateFromEl) dateFromEl.value = /* default or computed value */ '';
if (dateToEl) dateToEl.value = /* default or computed value */ '';