// Build a single-line filters summary for PDFs
export function buildFiltersSummary(filters = {}, formatDateFn) {
  const parts = [];
  if (filters.startDate) parts.push(`Start: ${formatDateFn ? formatDateFn(filters.startDate) : filters.startDate}`);
  if (filters.endDate) parts.push(`End: ${formatDateFn ? formatDateFn(filters.endDate) : filters.endDate}`);
  if (filters.store) parts.push(`Store: ${filters.store}`);
  if (filters.user) parts.push(`User: ${filters.user}`);
  if (filters.activityType) parts.push(`Type: ${filters.activityType}`);
  if (filters.transactionType) parts.push(`Type: ${filters.transactionType}`);
  if (filters.sortOrder) parts.push(`Sort: ${filters.sortOrder}`);
  return parts.filter(Boolean).join(' | ');
}

//Factory to create a row drawer that handles pagination
export function createRowDrawer(doc, startX, columnWidths) {
  let y = doc.y + 10;
  const drawRow = (cells, bold = false) => {
    let x = startX;
    cells.forEach((text, idx) => {
      if (bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
      doc.fontSize(8).text(String(text ?? ''), x, y, { width: columnWidths[idx], continued: false });
      x += columnWidths[idx];
    });
    y += 18;
    if (y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  };
  return { drawRow };
}


