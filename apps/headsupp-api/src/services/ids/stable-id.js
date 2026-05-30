function shortHash(value) {
  let hash = 5381;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function stableId(prefix, value) {
  const raw = String(value || '');
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    throw new Error('Cannot create stable id without a value.');
  }

  if (normalized.length <= 80) return `${prefix}_${normalized}`;

  return `${prefix}_${normalized.slice(0, 72)}_${shortHash(raw)}`;
}
