// SVG accepts comma-separated pairs and whitespace-separated coordinate lists.
export function pointsPath(points, closed = false) {
  const values = String(points).trim().split(/[\s,]+/).map(Number);
  if (values.length < 4 || values.length % 2 || values.some(n => !Number.isFinite(n))) throw new Error('Invalid SVG points');
  const pairs = [];
  for (let i = 0; i < values.length; i += 2) pairs.push(`${values[i]},${values[i + 1]}`);
  return `M${pairs.join('L')}${closed ? 'Z' : ''}`;
}
