export function escapeCsv(val) {
  const s = String(val ?? '');
  const needsQuote = /[",\n]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export function setCsvHeaders(res, safeBaseName) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeBaseName}.csv"`);
  // UTF-8 BOM for Excel compatibility
  res.write('\uFEFF');
}


