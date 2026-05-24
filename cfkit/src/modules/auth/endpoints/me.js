/**
 * Current user endpoint
 * GET /auth/me
 */

import { Datastore } from '../../datastore/index.js';
import { LOGS } from '../../logs/index.js';

/**
 * Get current user info
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {Object} auth - Auth context from middleware
 * @returns {Promise<Response>}
 */
export async function me(request, env, ctx, auth) {
  const logger = LOGS.init('AUTH.me');
  
  try {
    // Auth is required (handled by withAuth middleware)
    if (!auth) {
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Authentication required'
        }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Get user data
    const datastore = new Datastore(env, logger);
    const user = await datastore.get('USER', auth.user_id);
    
    if (!user) {
      logger.error('User not found', { userId: auth.user_id });
      return new Response(
        JSON.stringify({ 
          error: 'Not Found',
          message: 'User not found'
        }), 
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Remove sensitive data
    const { password_hash, _auth, ...userData } = user;
    
    // Add auth info
    const response = {
      ...userData,
      auth_type: auth.type,
      permissions: auth.permissions,
      rate_limit: auth.rate_limit
    };
    
    // Add session info if authenticated via session
    if (auth.type === 'user' && auth.session_id) {
      response.session = {
        id: auth.session_id,
        email: auth.email
      };
    }
    
    return new Response(
      JSON.stringify(response), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    logger.error('Get user error', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to get user info'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
