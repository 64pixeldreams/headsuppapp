/**
 * AUTH Singleton
 * Global auth instance for convenience
 */

import { Auth } from './auth.js';

class AuthSingleton {
  constructor() {
    this.instance = null;
  }

  /**
   * Initialize with environment
   * @param {Object} env - Cloudflare env with KV bindings
   * @param {Logger} logger - Optional logger instance
   */
  init(env, logger) {
    this.instance = new Auth(env, logger);
    return this.instance;
  }

  /**
   * Get current instance or throw
   */
  getInstance() {
    if (!this.instance) {
      throw new Error('AUTH not initialized. Call AUTH.init(env) first.');
    }
    return this.instance;
  }

  /**
   * Proxy methods to instance
   */
  async validateApiKey(request, logger = null) {
    return this.getInstance().validateApiKey(request);
  }

  async validateSession(request, logger = null) {
    return this.getInstance().validateSession(request);
  }
}

// Export singleton
export const AUTH = new AuthSingleton();
