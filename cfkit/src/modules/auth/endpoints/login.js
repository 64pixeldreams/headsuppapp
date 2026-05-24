/**
 * Login endpoint
 * POST /auth/login
 */

import { getPasswordHash, verifyPassword } from '../utils/passwords.js';
import { createSession, createSessionCookie } from '../utils/sessions.js';
import { LOGS } from '../../logs/index.js';

/**
 * Handle login request
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function login(request, env) {
  const logger = LOGS.init('AUTH.login');
  
  try {
    // Parse request body
    const body = await request.json();
    const { email, password } = body;
    
    // Validate input
    if (!email || !password) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request',
          message: 'Email and password required'
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    logger.log('Login attempt', { email });
    
    // Get password hash
    const passwordData = await getPasswordHash(env, email.toLowerCase(), logger);
    
    if (!passwordData) {
      logger.warn('Login failed - user not found', { email });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid credentials',
          message: 'Invalid email or password'
        }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Verify password
    const isValid = await verifyPassword(password, passwordData.hash);
    
    if (!isValid) {
      logger.warn('Login failed - invalid password', { email });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid credentials',
          message: 'Invalid email or password'
        }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Create session
    const session = await createSession(
      env, 
      passwordData.user_id, 
      email,
      request,
      logger
    );
    
    logger.log('Login successful', { 
      userId: passwordData.user_id,
      email 
    });
    
    // Return success with session cookie
    return new Response(
      JSON.stringify({ 
        success: true,
        userId: passwordData.user_id,
        email: email,
        session_token: session.token,
        expires: session.expires
      }), 
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': createSessionCookie(session.token, new Date(session.expires))
        }
      }
    );
    
  } catch (error) {
    logger.error('Login error', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Login failed'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
