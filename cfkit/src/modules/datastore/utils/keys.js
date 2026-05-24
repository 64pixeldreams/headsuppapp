/**
 * Key generation and manipulation utilities
 * Handles composite keys, key validation, etc.
 * See specs/00-datastore.md for key patterns
 */

/**
 * Validate entity class name against available KV mappings
 * @param {string} className - Class to validate
 * @param {Object} kvMappings - Available KV namespace mappings
 * @throws {Error} If class is invalid
 */
export function validateClass(className, kvMappings = {}) {
  // If no mappings provided, skip validation (trust the model registration)
  if (!kvMappings || Object.keys(kvMappings).length === 0) {
    return;
  }
  
  if (!kvMappings[className]) {
    const available = Object.keys(kvMappings).join(', ');
    throw new Error(`Invalid class: ${className}. Available classes: ${available}`);
  }
}

/**
 * Create KV key from class and ID
 * @param {string} className - Entity class
 * @param {string} id - Entity ID
 * @returns {string} Formatted key
 */
export function makeKey(className, id) {
  return `${className.toLowerCase()}:${id}`;
}

/**
 * Create composite key from multiple parts
 * @param {...string} parts - Key parts to join
 * @returns {string} Composite key
 * @example
 * compositeKey('proj_123', 'page_456') => 'proj_123:page_456'
 */
export function compositeKey(...parts) {
  return parts.join(':');
}

/**
 * Parse key into parts
 * @param {string} key - Key to parse
 * @returns {Object} Parsed key parts
 */
export function parseKey(key) {
  const parts = key.split(':');
  return {
    class: parts[0],
    id: parts.slice(1).join(':')
  };
}

/**
 * Generate unique ID for entity
 * @param {string} prefix - Entity prefix (e.g., 'user', 'proj')
 * @returns {string} Unique ID
 */
export function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${randomPart}`;
}
