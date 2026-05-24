/**
 * Signup endpoint
 * POST /auth/signup
 */

import { createUser } from '../../user/core/create.js';
import { createSession, createSessionCookie } from '../utils/sessions.js';
import { validatePasswordStrength } from '../utils/passwords.js';
import { LOGS } from '../../logs/index.js';
import { Messenger } from '../../messaging/index.js';

/**
 * Handle signup request
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function signup(request, env) {
  const logger = LOGS.init('AUTH.signup');
  
  try {
    // Parse request body
    const body = await request.json();
    const { email, password, name } = body;
    
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
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request',
          message: 'Invalid email format'
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request',
          message: 'Password requirements not met',
          errors: passwordValidation.errors
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    logger.log('Signup attempt', { email });
    
    // Create user using DataModel
    // Messaging is optional in early-stage deployments. If no adapters are configured,
    // skip instantiating Messenger so signup can still succeed.
    let messenger = null;
    const hasMessagingConfig = !!(env.MAILERSEND_API_KEY || env.SLACK_WEBHOOK_URL || env.SLACK_BOT_TOKEN);
    if (hasMessagingConfig) {
      try {
        messenger = new Messenger(env, logger);
      } catch (e) {
        logger.warn('Messaging not configured; continuing without outbound email/slack', { error: e?.message });
        messenger = null;
      }
    }
    const result = await createUser(
      email, 
      password, 
      { name: name || email.split('@')[0] }, 
      env, 
      messenger, 
      logger
    );
    
    if (!result.success) {
      if (result.error.includes('already exists')) {
        logger.warn('Signup failed - email already exists', { email });
        return new Response(
          JSON.stringify({ 
            error: 'Conflict',
            message: 'Email already registered'
          }), 
          { 
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      logger.error('User creation failed', { error: result.error });
      return new Response(
        JSON.stringify({ 
          error: 'Internal Server Error',
          message: 'Signup failed'
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const userId = result.user.user_id;
    
    // Create initial session (password hash already stored by UserModel hook)
    const session = await createSession(env, userId, email, request, logger);
    
    logger.log('Signup successful', { userId, email });
    
    // Return success with session
    return new Response(
      JSON.stringify({ 
        success: true,
        userId: userId,
        email: email,
        session_token: session.token,
        expires: session.expires
      }), 
      { 
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': createSessionCookie(session.token, new Date(session.expires))
        }
      }
    );
    
  } catch (error) {
    logger.error('Signup error', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Signup failed'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

