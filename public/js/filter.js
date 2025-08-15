const today = new Date().toISOString().split('T')[0];
// Track if filters were explicitly applied by the user
window.filtersApplied = false;

// Get date input elements
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const applyFiltersBtn = document.getElementById('applyFilters');

// Set initial values and constraints
endDateInput.value = today;
startDateInput.max = today;
endDateInput.max = today;

// Set minimum date for start date (e.g., 1 year ago)
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
startDateInput.min = oneYearAgo.toISOString().split('T')[0];

// Add event listeners for date validation
startDateInput.addEventListener('change', validateDates);
endDateInput.addEventListener('change', validateDates);

function validateDates() {
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
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const store = document.getElementById('storeFilter')?.value;
    const user = document.getElementById('userFilter')?.value;
    const activityType = document.getElementById('activityType')?.value;
    const transactionType = document.getElementById('transactionType')?.value;
    const sortOrder = document.getElementById('sortOrder')?.value;

    try {
        // Choose endpoint based on current page
        let endpoint = '/reports/sales/filter';
        const pathname = window.location.pathname || '';
        if (pathname.includes('/reports/activity')) {
            endpoint = '/reports/activity/filter';
        } else if (pathname.includes('/reports/transactions')) {
            endpoint = '/reports/transactions/filter';
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                startDate,
                endDate,
                store,
                user,
                activityType,
                transactionType,
                sortOrder
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