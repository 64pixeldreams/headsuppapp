/**
 * UUID Generation Utility
 * Uses crypto.randomUUID() available in Cloudflare Workers
 */

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
export function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Generate a prefixed ID
 * @param {string} prefix - Prefix for the ID (e.g., 'page', 'proj')
 * @returns {string} Prefixed ID (e.g., 'page:mf8y0hsj194812')
 */
export function generatePrefixedId(prefix) {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}:${timestamp}${randomPart}`;
}
