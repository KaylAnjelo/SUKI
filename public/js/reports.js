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
}); 