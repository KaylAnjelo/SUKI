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
  const { startDate, endDate, store, sortOrder } = getCurrentSalesFilters();
  const shouldIncludeFilters = window.filtersApplied === true;
  const params = new URLSearchParams({ filename });
  if (shouldIncludeFilters) {
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (store) params.set('store', store);
    if (sortOrder) params.set('sortOrder', sortOrder);
  } else {
    if (sortOrder) params.set('sortOrder', sortOrder);
  }
  window.location.href = `/reports/sales/export/csv?${params.toString()}`;
}

function downloadPDF(filename) {
  const { startDate, endDate, store, sortOrder } = getCurrentSalesFilters();
  const shouldIncludeFilters = window.filtersApplied === true;
  const params = new URLSearchParams({ filename });
  if (shouldIncludeFilters) {
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (store) params.set('store', store);
    if (sortOrder) params.set('sortOrder', sortOrder);
  } else {
    if (sortOrder) params.set('sortOrder', sortOrder);
  }
  window.location.href = `/reports/sales/export/pdf?${params.toString()}`;
}