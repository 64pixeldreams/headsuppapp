/**
 * Function Registry
 * Manages registration and lookup of CloudFunction handlers
 */

export class FunctionRegistry {
  constructor() {
    this.functions = new Map();
    this.metadata = new Map();
  }

  /**
   * Register a function handler
   * @param {string} action - Function action name
   * @param {Function} handler - Function handler
   * @param {Object} options - Function options
   */
  register(action, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler for ${action} must be a function`);
    }

    this.functions.set(action, handler);
    this.metadata.set(action, {
      auth: options.auth !== false, // Default to true
      validation: options.validation || {},
      timeout: options.timeout || 30000,
      rateLimit: options.rateLimit || null,
      logLevel: options.logLevel || 'info',
      ...options
    });
  }

  /**
   * Get function handler
   * @param {string} action - Function action name
   * @returns {Function|null} Function handler
   */
  getHandler(action) {
    return this.functions.get(action) || null;
  }

  /**
   * Get function metadata
   * @param {string} action - Function action name
   * @returns {Object|null} Function metadata
   */
  getMetadata(action) {
    return this.metadata.get(action) || null;
  }

  /**
   * Check if function exists
   * @param {string} action - Function action name
   * @returns {boolean} Function exists
   */
  exists(action) {
    return this.functions.has(action);
  }

  /**
   * Get all registered functions
   * @returns {Array} List of function names
   */
  list() {
    return Array.from(this.functions.keys());
  }

  /**
   * Get function info for debugging
   * @param {string} action - Function action name
   * @returns {Object} Function info
   */
  getInfo(action) {
    const metadata = this.getMetadata(action);
    if (!metadata) return null;

    return {
      action,
      exists: true,
      auth: metadata.auth,
      timeout: metadata.timeout,
      hasValidation: Object.keys(metadata.validation).length > 0,
      rateLimit: metadata.rateLimit
    };
  }
}
