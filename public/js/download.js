let fileType = '';

function openModal(type) {
  fileType = type;
  document.getElementById('fileModal').style.display = 'block';
  document.getElementById('fileNameInput').value = '';
}

function closeModal() {
  document.getElementById('fileModal').style.display = 'none';
}

function downloadFile() {
  const filename = document.getElementById('fileNameInput').value.trim();
  if (!filename) {
    alert("Please enter a file name.");
    return;
  }

  closeModal();

  if (fileType === 'csv') {
    downloadCSV(filename);
  } else if (fileType === 'pdf') {
    downloadPDF(filename);
  }
}

function getCurrentSalesFilters() {
  const startDate = document.getElementById('startDate')?.value || '';
  const endDate = document.getElementById('endDate')?.value || '';
  const store = document.getElementById('storeFilter')?.value || '';
  const sortOrder = document.getElementById('sortOrder')?.value || '';
  return { startDate, endDate, store, sortOrder };
}

function downloadCSV(filename) {
  const path = window.location.pathname || '';
  const { startDate, endDate, store, sortOrder } = getCurrentSalesFilters();
  const user = document.getElementById('userFilter')?.value || '';
  const activityType = document.getElementById('activityType')?.value || '';
  const transactionType = document.getElementById('transactionType')?.value || '';
  const shouldIncludeFilters = window.filtersApplied === true;
  const params = new URLSearchParams({ filename });
  if (shouldIncludeFilters) {
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (store) params.set('store', store);
    if (sortOrder) params.set('sortOrder', sortOrder);
    if (user) params.set('user', user);
    if (activityType) params.set('activityType', activityType);
    if (transactionType) params.set('transactionType', transactionType);
  } else {
    if (sortOrder) params.set('sortOrder', sortOrder);
  }
  let endpoint = '/reports/sales/export/csv';
  if (path.includes('/reports/transactions')) endpoint = '/reports/transactions/export/csv';
  if (path.includes('/reports/activity')) endpoint = '/reports/activity/export/csv';
  window.location.href = `${endpoint}?${params.toString()}`;
}

function downloadPDF(filename) {
  const path = window.location.pathname || '';
  const { startDate, endDate, store, sortOrder } = getCurrentSalesFilters();
  const user = document.getElementById('userFilter')?.value || '';
  const activityType = document.getElementById('activityType')?.value || '';
  const transactionType = document.getElementById('transactionType')?.value || '';
  const shouldIncludeFilters = window.filtersApplied === true;
  const params = new URLSearchParams({ filename });
  if (shouldIncludeFilters) {
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (store) params.set('store', store);
    if (sortOrder) params.set('sortOrder', sortOrder);
    if (user) params.set('user', user);
    if (activityType) params.set('activityType', activityType);
    if (transactionType) params.set('transactionType', transactionType);
  } else {
    if (sortOrder) params.set('sortOrder', sortOrder);
  }
  let endpoint = '/reports/sales/export/pdf';
  if (path.includes('/reports/transactions')) endpoint = '/reports/transactions/export/pdf';
  if (path.includes('/reports/activity')) endpoint = '/reports/activity/export/pdf';
  window.location.href = `${endpoint}?${params.toString()}`;
}