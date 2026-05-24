/**
 * Logout endpoint
 * POST /auth/logout
 */

import { deleteSession, createLogoutCookie } from '../utils/sessions.js';
import { LOGS } from '../../logs/index.js';

/**
 * Handle logout request
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {Object} auth - Auth context from middleware
 * @returns {Promise<Response>}
 */
export async function logout(request, env, ctx, auth) {
  const logger = LOGS.init('AUTH.logout');
  
  try {
    // If authenticated via session, delete it
    if (auth && auth.type === 'user' && auth.session_id) {
      await deleteSession(env, auth.session_id, logger);
      logger.log('Session deleted', { 
        userId: auth.user_id,
        sessionId: auth.session_id 
      });
    }
    
    // Return success with cookie removal
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Logged out successfully'
      }), 
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': createLogoutCookie()
        }
      }
    );
    
  } catch (error) {
    logger.error('Logout error', error);
    // Still clear cookie on error
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Logged out'
      }), 
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': createLogoutCookie()
        }
      }
    );
  }
}
