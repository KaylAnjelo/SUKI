const today = new Date().toISOString().split('T')[0];
document.getElementById('endDate').value = today;

// Optional: Set max date to today for start date
document.getElementById('startDate').max = today;