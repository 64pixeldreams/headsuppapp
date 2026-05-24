/**
 * Core Auth class
 * Handles both API key and session validation
 */

import { validateApiKeyHash, hashApiKey } from '../utils/api-keys.js';
import { validateSessionToken } from '../utils/sessions.js';
import { LOGS } from '../../logs/index.js';
import { Datastore } from '../../datastore/index.js';

export class Auth {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger?.init('AUTH') || LOGS.init('AUTH');
  }

  /**
   * Validate API key from request
   * @param {Request} request
   * @returns {Promise<AuthContext|null>}
   */
  async validateApiKey(request) {
    const timer = this.logger.timer('validateApiKey');
    
    try {
      // Extract Bearer token
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        timer.end({ found: false });
        return null;
      }

      const apiKey = authHeader.substring(7);
      this.logger.debug('Validating API key');

      // Hash the API key
      const keyHash = await hashApiKey(apiKey);

      // Create datastore instance
      const datastore = new Datastore(this.env, this.logger);

      // Validate and get auth context
      const authContext = await validateApiKeyHash(keyHash, datastore, this.logger);
      
      if (!authContext) {
        this.logger.debug('Invalid API key');
        timer.end({ valid: false });
        return null;
      }

      timer.end({ valid: true, userId: authContext.user_id });
      return {
        type: 'api',
        ...authContext
      };

    } catch (error) {
      this.logger.error('API key validation failed', error);
      timer.end({ error: true });
      return null;
    }
  }

  /**
   * Validate session from request cookies
   * @param {Request} request
   * @returns {Promise<AuthContext|null>}
   */
  async validateSession(request) {
    const timer = this.logger.timer('validateSession');
    
    try {
      // Extract session from Cookie header OR X-Session-Token header
      let sessionToken = null;
      
      // Try Cookie header first (for same-domain requests)
      const cookieHeader = request.headers.get('Cookie');
      if (cookieHeader) {
        this.logger.debug('Cookie header found', { cookie: cookieHeader });
        sessionToken = this.parseSessionCookie(cookieHeader);
        if (sessionToken) {
          this.logger.debug('Session found in Cookie header');
        }
      }
      
      // Try X-Session-Token header (for cross-domain requests)
      if (!sessionToken) {
        sessionToken = request.headers.get('X-Session-Token');
        if (sessionToken) {
          this.logger.debug('Session found in X-Session-Token header');
        }
      }
      
      if (!sessionToken) {
        this.logger.debug('No session found in Cookie or X-Session-Token headers');
        timer.end({ found: false });
        return null;
      }

      this.logger.debug('Found session token', { token: sessionToken.substring(0, 10) + '...' });

      // Validate session
      const authContext = await validateSessionToken(this.env, sessionToken);
      
      if (!authContext) {
        this.logger.debug('Session validation returned null');
        timer.end({ valid: false });
        return null;
      }

      timer.end({ valid: true, userId: authContext.user_id });
      return {
        type: 'user',
        ...authContext
      };

    } catch (error) {
      this.logger.error('Session validation error', error);
      this.logger.error('Error stack', error.stack);
      timer.end({ error: true });
      return null;
    }
  }

  /**
   * Parse session token from cookie header
   * @private
   */
  parseSessionCookie(cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('nimbus_session='));
    return sessionCookie ? sessionCookie.split('=')[1] : null;
  }
}
