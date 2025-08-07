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

function downloadCSV(filename) {
  const table = document.getElementById('salesTable');
  let csv = [];

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    let rowData = [];
    const cells = Array.from(row.cells);

    if (i === 0) {
      // Header row
      for (let cell of cells) {
        rowData.push(`"${cell.textContent.trim()}"`);
      }
    } else {
      // Date (1st cell)
      const date = cells[0]?.textContent.trim();
      rowData.push(`"${date}"`);

      // Store (2nd cell)
      const store = cells[1]?.textContent.trim();
      rowData.push(`"${store}"`);

      // Remaining cells (Reference Number, Product, Amount, etc.)
      for (let j = 2; j < cells.length; j++) {
        rowData.push(`"${cells[j].textContent.trim()}"`);
      }
    }

    csv.push(rowData.join(','));
  }

  const csvContent = '\uFEFF' + csv.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

function downloadPDF(filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.autoTable({ html: '#salesTable' });
  doc.save(`${filename}.pdf`);
}