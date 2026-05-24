/**
 * Auth middleware for Cloudflare Workers
 * Wraps handlers with authentication
 */

import { AUTH } from '../core/singleton.js';
import { LOGS } from '../../logs/index.js';

/**
 * Middleware that requires authentication
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {Function} handler - Handler function that receives auth context
 * @returns {Promise<Response>}
 */
export async function withAuth(request, env, ctx, handler) {
  // Set request context for logging if not already set
  if (!LOGS.getRequestId()) {
    LOGS.setRequest({
      requestId: crypto.randomUUID(),
      url: request.url,
      method: request.method
    });
  }
  
  const logger = LOGS.init('AUTH.middleware');
  
  try {
    // Initialize AUTH if not already done
    if (!AUTH.instance) {
      AUTH.init(env, logger);
    }

    // Try API key first
    const apiAuth = await AUTH.validateApiKey(request);
    if (apiAuth) {
      logger.log('Authenticated via API key', { userId: apiAuth.user_id });
      return handler(request, env, ctx, apiAuth);
    }
    
    // Try session
    const sessionAuth = await AUTH.validateSession(request);
    if (sessionAuth) {
      logger.log('Authenticated via session', { userId: sessionAuth.user_id });
      return handler(request, env, ctx, sessionAuth);
    }
    
    // No valid auth
    logger.warn('Authentication failed');
    return new Response(
      JSON.stringify({ 
        error: 'Unauthorized',
        message: 'Valid API key or session required',
        logs: LOGS.getRecent(20),
        requestId: LOGS.getRequestId()
      }), 
      { 
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer'
        }
      }
    );
    
  } catch (error) {
    logger.error('Auth middleware error', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Authentication system error',
        logs: LOGS.getRecent(20),
        requestId: LOGS.getRequestId()
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Optional auth middleware - continues even without auth
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {Function} handler
 * @returns {Promise<Response>}
 */
export async function withOptionalAuth(request, env, ctx, handler) {
  const logger = LOGS.init('AUTH.optional');
  
  try {
    // Initialize AUTH if not already done
    if (!AUTH.instance) {
      AUTH.init(env, logger);
    }

    // Try to get auth but don't require it
    const apiAuth = await AUTH.validateApiKey(request);
    if (apiAuth) {
      return handler(request, env, ctx, apiAuth);
    }
    
    const sessionAuth = await AUTH.validateSession(request);
    if (sessionAuth) {
      return handler(request, env, ctx, sessionAuth);
    }
    
    // Continue without auth
    return handler(request, env, ctx, null);
    
  } catch (error) {
    logger.error('Optional auth error', error);
    // Continue without auth on error
    return handler(request, env, ctx, null);
  }
}
