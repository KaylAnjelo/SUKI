export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

export function formatDateMDY(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// Returns a Date representing the start of the week (Monday) in UTC for the given date
export function getWeekStartUTC(d) {
  const input = d instanceof Date ? d : new Date(d);
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = (day === 0 ? -6 : 1) - day; // Monday as start of week
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}


