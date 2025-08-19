// Apply optional start/end date filters to a Supabase query
export function applyDateRange(query, column, startDate, endDate) {
  let q = query;
  if (startDate) q = q.gte(column, startDate);
  if (endDate) q = q.lte(column, endDate);
  return q;
}


