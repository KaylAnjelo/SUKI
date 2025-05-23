const today = new Date().toISOString().split('T')[0];

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

// Function to apply filters
async function applyFilters() {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    
    // Get additional filters based on the page type
    let additionalFilters = {};
    
    // Check which page we're on and get the appropriate filters
    if (document.getElementById('storeFilter')) {
        additionalFilters.store = document.getElementById('storeFilter').value;
    }
    if (document.getElementById('userFilter')) {
        additionalFilters.user = document.getElementById('userFilter').value;
    }
    if (document.getElementById('activityType')) {
        additionalFilters.activityType = document.getElementById('activityType').value;
    }
    if (document.getElementById('transactionType')) {
        additionalFilters.transactionType = document.getElementById('transactionType').value;
    }
    if (document.getElementById('sortOrder')) {
        additionalFilters.sortOrder = document.getElementById('sortOrder').value;
    }

    try {
        // Get the current page path
        const currentPath = window.location.pathname;
        
        // Make the API call to get filtered data
        const response = await fetch(`${currentPath}/filter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                startDate,
                endDate,
                ...additionalFilters
            })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        
        // Update the table with filtered data
        updateTable(data);
        
    } catch (error) {
        console.error('Error applying filters:', error);
        // You might want to show an error message to the user here
    }
}

// Function to update the table with filtered data
function updateTable(data) {
    const tableBody = document.querySelector('table tbody');
    if (!tableBody) return;

    // Clear existing table rows
    tableBody.innerHTML = '';

    if (data.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="6">No data available for the selected filters.</td>';
        tableBody.appendChild(row);
        return;
    }

    // Add new rows based on the filtered data
    data.forEach(item => {
        const row = document.createElement('tr');
        // Adjust the row content based on the page type
        if (window.location.pathname.includes('/reports/sales')) {
            row.innerHTML = `
                <td>${formatDate(item.transaction_date)}</td>
                <td>${item.store_name}</td>
                <td>${item.reference_number}</td>
                <td>${item.products_sold}</td>
                <td>₱${parseFloat(item.total_amount).toFixed(2)}</td>
                <td><span class="status-badge ${item.status.toLowerCase()}">${item.status}</span></td>
            `;
        } else if (window.location.pathname.includes('/reports/activity')) {
            row.innerHTML = `
                <td>${formatDate(item.date_time)}</td>
                <td>${item.user}</td>
                <td>${item.activity_type}</td>
                <td>${item.details}</td>
                <td><span class="status-badge ${item.status.toLowerCase()}">${item.status}</span></td>
            `;
        } else if (window.location.pathname.includes('/reports/transactions')) {
            row.innerHTML = `
                <td>${formatDate(item.date_time)}</td>
                <td>${item.user}</td>
                <td>${item.transaction_type}</td>
                <td>${item.transaction_id}</td>
                <td>₱${parseFloat(item.amount).toFixed(2)}</td>
                <td><span class="status-badge ${item.status.toLowerCase()}">${item.status}</span></td>
            `;
        }
        tableBody.appendChild(row);
    });
}

// Helper function to format dates
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Add event listener for the apply filters button
if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', applyFilters);
}

// Initial validation
validateDates();