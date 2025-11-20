document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];

    // Set end date to today
    const endDateInput = document.getElementById('endDate');
    if (endDateInput) {
        endDateInput.value = today;
    }

    // Set max date to today for start date
    const startDateInput = document.getElementById('startDate');
    if (startDateInput) {
        startDateInput.max = today;
    }

    // Clear Filters button functionality
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            // Reset date fields
            if (startDateInput) startDateInput.value = '';
            if (endDateInput) endDateInput.value = today;
            // Reset transaction type or activity type
            const typeSelect = document.getElementById('transactionType');
            if (typeSelect) typeSelect.value = '';
            const activitySelect = document.getElementById('activityType');
            if (activitySelect) activitySelect.value = '';
            // Optionally, trigger filter update if needed
            if (typeof applyFilters === 'function') {
                applyFilters();
            }
        });
    }
});