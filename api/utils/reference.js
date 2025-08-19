export function generateReferenceNumber(dateString, storeName) {
  const datePart = new Date(dateString || Date.now())
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  const storePart = String(storeName || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${storePart}-${datePart}-${random}`;
}


