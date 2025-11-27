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

function suggestName(prefix) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${prefix}_${stamp}`;
}

async function quickDownloadCSV() {
  const base = suggestName('report');
  await downloadCSV(base);
}

async function quickDownloadPDF() {
  const base = suggestName('report');
  await downloadPDF(base);
}

async function saveBlobWithPicker(suggestedName, mimeType, ext, blob) {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        { description: mimeType, accept: { [mimeType]: [ext] } }
      ]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

async function downloadCSV(filename) {
  const path = window.location.pathname || '';
  const { startDate, endDate, store, sortOrder } = getCurrentSalesFilters();
  const customer = document.getElementById('customerFilter')?.value || '';
  const vendor = document.getElementById('vendorFilter')?.value || '';
  const activityType = document.getElementById('activityType')?.value || '';
  const transactionType = document.getElementById('transactionType')?.value || '';
  const shouldIncludeFilters = window.filtersApplied === true;
  const params = new URLSearchParams({ filename });
  if (shouldIncludeFilters) {
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (store) params.set('store', store);
    if (sortOrder) params.set('sortOrder', sortOrder);
    // send customer and vendor separately so export matches UI filtering
    if (customer) params.set('customer', customer);
    if (vendor) params.set('vendor', vendor);
    if (activityType) params.set('activityType', activityType);
    if (transactionType) params.set('transactionType', transactionType);
  } else {
    if (sortOrder) params.set('sortOrder', sortOrder);
  }
  let endpoint = '/reports/sales/export/csv';
  if (path.includes('/reports/transactions')) endpoint = '/reports/transactions/export/csv';
  if (path.includes('/reports/activity')) endpoint = '/reports/activity/export/csv';

  const res = await fetch(`${endpoint}?${params.toString()}`, { method: 'GET' });
  if (!res.ok) { alert('Failed to generate CSV'); return; }
  const blob = await res.blob();
  await saveBlobWithPicker(`${filename}.csv`, 'text/csv', '.csv', blob);
}

async function downloadPDF(filename) {
  const path = window.location.pathname || '';
  const { startDate, endDate, store, sortOrder } = getCurrentSalesFilters();
  const customer = document.getElementById('customerFilter')?.value || '';
  const vendor = document.getElementById('vendorFilter')?.value || '';
  const activityType = document.getElementById('activityType')?.value || '';
  const transactionType = document.getElementById('transactionType')?.value || '';
  const shouldIncludeFilters = window.filtersApplied === true;
  const params = new URLSearchParams({ filename });
  if (shouldIncludeFilters) {
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (store) params.set('store', store);
    if (sortOrder) params.set('sortOrder', sortOrder);
    // send customer and vendor separately so export matches UI filtering
    if (customer) params.set('customer', customer);
    if (vendor) params.set('vendor', vendor);
    if (activityType) params.set('activityType', activityType);
    if (transactionType) params.set('transactionType', transactionType);
  } else {
    if (sortOrder) params.set('sortOrder', sortOrder);
  }
  let endpoint = '/reports/sales/export/pdf';
  if (path.includes('/reports/transactions')) endpoint = '/reports/transactions/export/pdf';
  if (path.includes('/reports/activity')) endpoint = '/reports/activity/export/pdf';

  const res = await fetch(`${endpoint}?${params.toString()}`, { method: 'GET' });
  if (!res.ok) { alert('Failed to generate PDF'); return; }
  const blob = await res.blob();
  await saveBlobWithPicker(`${filename}.pdf`, 'application/pdf', '.pdf', blob);
}