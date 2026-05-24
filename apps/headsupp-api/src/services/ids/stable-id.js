export function stableId(prefix, value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  if (!normalized) {
    throw new Error('Cannot create stable id without a value.');
  }

  return `${prefix}_${normalized}`;
}
