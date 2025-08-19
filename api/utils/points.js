export function calculatePoints(amount) {
  const numericAmount = Number(amount) || 0;
  const points = numericAmount * 0.10;
  return Number(points.toFixed(2));
}


