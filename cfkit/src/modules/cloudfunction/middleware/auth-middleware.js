/**
 * Authentication Middleware
 * Handles authentication for CloudFunction requests
 */

import { AUTH } from '../../auth/core/singleton.js';
import { LOGS } from '../../logs/index.js';

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function constantTimeEqual(a, b) {
  const left = await sha256Hex(a);
  const right = await sha256Hex(b);
  if (left.length !== right.length) return false;
  let out = 0;
  for (let i = 0; i < left.length; i += 1) {
    out |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return out === 0;
}

export class AuthMiddleware {
  constructor(env) {
    this.env = env;
  }

  /**
   * Process authentication for a request
   * @param {Request} request - Original request
   * @param {Object} metadata - Function metadata
   * @returns {Promise<Object|null>} Auth context or null
   */
  async process(request, metadata) {
    const logger = LOGS.init('cloudfunction.auth');
    
    // Skip auth if not required
    if (!metadata.auth) {
      return null;
    }

    try {
      // Initialize AUTH if not already done
      if (!AUTH.instance) {
        AUTH.init(this.env, logger);
      }

      // Try API key first
      const apiAuth = await AUTH.validateApiKey(request, logger);
      if (apiAuth) {
        logger.log('Authenticated via API key', { userId: apiAuth.user_id });
        return {
          type: 'api',
          ...apiAuth
        };
      }

      // Try session
      const sessionAuth = await AUTH.validateSession(request, logger);
      if (sessionAuth) {
        logger.log('Authenticated via session', { userId: sessionAuth.user_id });
        return {
          type: 'session',
          ...sessionAuth
        };
      }

      const smokeAuth = await this.validateSmokeKey(request, logger);
      if (smokeAuth) {
        logger.log('Authenticated via smoke key', { userId: smokeAuth.user_id });
        return smokeAuth;
      }

      // No valid auth found
      logger.warn('Authentication failed - no valid auth found');
      return null;

    } catch (error) {
      logger.error('Auth middleware error', error);
      return null;
    }
  }

  async validateSmokeKey(request, logger) {
    const configuredKey = String(this.env?.ORACLE_SMOKE_API_KEY || '').trim();
    const userId = String(this.env?.ORACLE_SMOKE_USER_ID || '').trim();
    if (!configuredKey || !userId) return null;

    const providedKey = String(request.headers.get('X-Foretic-Smoke-Key') || '').trim();
    if (!providedKey) return null;

    const ok = await constantTimeEqual(providedKey, configuredKey);
    if (!ok) {
      logger.warn('Invalid smoke key provided');
      return null;
    }

    return {
      type: 'smoke',
      user_id: userId,
      email: String(this.env?.ORACLE_SMOKE_EMAIL || 'smoke@foretic.internal').trim(),
      permissions: ['read', 'write'],
      rate_limit: { requests: 1000, window: 3600 },
      key_id: 'foretic-smoke',
    };
  }
}
