// Apply optional start/end date filters to a Supabase query
export function applyDateRange(query, column, startDate, endDate) {
  let q = query;

  // Normalize dates to cover entire days when only YYYY-MM-DD is provided
  const normalizeStart = (d) => {
    if (!d) return undefined;
    // If already has time component, pass through
    if (/[T\s]\d{2}:\d{2}/.test(d)) return d;
    return `${d}T00:00:00.000`;
  };

  const normalizeEnd = (d) => {
    if (!d) return undefined;
    if (/[T\s]\d{2}:\d{2}/.test(d)) return d;
    return `${d}T23:59:59.999`;
  };

  const start = normalizeStart(startDate);
  const end = normalizeEnd(endDate);

  if (start) q = q.gte(column, start);
  if (end) q = q.lte(column, end);
  return q;
}


