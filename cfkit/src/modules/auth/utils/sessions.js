/**
 * Session management utilities
 */

import { Datastore } from '../../datastore/index.js';
import { LOGS } from '../../logs/index.js';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

/**
 * Validate session token and return auth context
 * @param {Object} env - Cloudflare env
 * @param {string} sessionToken - Session token
 * @returns {Promise<AuthContext|null>}
 */
export async function validateSessionToken(env, sessionToken) {
  const logger = LOGS.init('AUTH.validateSession');
  const timer = logger.timer('validateSessionToken');
  
  try {
    logger.debug('Validating session token', { token: sessionToken.substring(0, 10) + '...' });
    
    const datastore = new Datastore(env, logger);
    const session = await datastore.get('SESSION', sessionToken);
    
    if (!session) {
      logger.debug('Session not found in datastore');
      timer.end({ found: false });
      return null;
    }

    logger.debug('Session found', { userId: session.user_id, expires: session.expires });

    // Check if expired
    const expires = new Date(session.expires);
    if (expires < new Date()) {
      logger.debug('Session expired', { expires: session.expires });
      // Clean up expired session
      await datastore.delete('SESSION', sessionToken);
      timer.end({ expired: true });
      return null;
    }

    // Get user data for permissions
    const user = await datastore.get('USER', session.user_id);
    
    if (!user) {
      logger.error('User not found for session', { userId: session.user_id });
      timer.end({ userNotFound: true });
      return null;
    }

    logger.debug('Session validated successfully', { userId: session.user_id });
    timer.end({ success: true });

    // Return auth context
    return {
      user_id: session.user_id,
      email: session.email,
      permissions: user.permissions || ['read', 'write'],
      rate_limit: user.rate_limit || { requests: 1000, window: 3600 },
      session_id: sessionToken
    };
  } catch (error) {
    logger.error('Session validation error', error);
    timer.end({ error: true });
    return null;
  }
}

/**
 * Create a new session
 * @param {Object} env - Cloudflare env
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {Request} request - Original request for IP/UA
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Session data with token
 */
export async function createSession(env, userId, email, request, logger) {
  const timer = logger?.timer('createSession');
  
  try {
    const sessionToken = generateSessionToken();
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_DURATION);
    
    // Safely extract headers
    let ip = 'unknown';
    let user_agent = 'unknown';
    
    try {
      if (request?.headers) {
        if (typeof request.headers.get === 'function') {
          ip = request.headers.get('CF-Connecting-IP') || 'unknown';
          user_agent = request.headers.get('User-Agent') || 'unknown';
        } else if (request.headers['CF-Connecting-IP']) {
          ip = request.headers['CF-Connecting-IP'] || 'unknown';
          user_agent = request.headers['User-Agent'] || 'unknown';
        }
      }
    } catch (headerError) {
      logger?.warn('Failed to extract headers', headerError);
    }
    
    const sessionData = {
      user_id: userId,
      email,
      created: now.toISOString(),
      expires: expires.toISOString(),
      ip,
      user_agent
    };

    logger?.log('Creating session', { userId, email, token: sessionToken.substring(0, 10) + '...' });

    // Store in datastore
    const datastore = new Datastore(env, logger);
    
    logger?.log('Attempting to store session', { 
      token: sessionToken.substring(0, 10) + '...',
      namespace: 'SESSION',
      dataLength: JSON.stringify(sessionData).length
    });
    
    await datastore.put('SESSION', sessionToken, sessionData);
    
    logger?.log('Session stored in KV', { 
      token: sessionToken.substring(0, 10) + '...',
      namespace: 'NIMBUS_SESSIONS'
    });

    // Add to user's sessions list (temporarily disabled for debugging)
    // await datastore.queryListAddItem('sessions', userId, sessionToken);

    timer?.end({ success: true });
    
    return {
      token: sessionToken,
      expires: expires.toISOString(),
      ...sessionData
    };
    
  } catch (error) {
    logger?.error('Session creation failed', error);
    timer?.end({ error: true });
    throw error;
  }
}

/**
 * Delete a session
 * @param {Object} env - Cloudflare env
 * @param {string} sessionToken - Session token to delete
 * @param {Object} logger - Logger instance
 */
export async function deleteSession(env, sessionToken, logger) {
  const datastore = new Datastore(env, logger);
  
  // Get session to find user
  const session = await datastore.get('SESSION', sessionToken);
  if (session) {
    // Remove from user's sessions list
    await datastore.queryListRemoveItem('sessions', session.user_id, sessionToken);
  }
  
  // Delete session
  await datastore.delete('SESSION', sessionToken);
}

/**
 * Generate a secure session token
 * @returns {string} Session token
 */
export function generateSessionToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create session cookie header
 * @param {string} token - Session token
 * @param {Date} expires - Expiration date
 * @returns {string} Set-Cookie header value
 */
export function createSessionCookie(token, expires) {
  return [
    `nimbus_session=${token}`,
    `Expires=${expires.toUTCString()}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/'
  ].join('; ');
}

/**
 * Create logout cookie header (clears session)
 * @returns {string} Set-Cookie header value
 */
export function createLogoutCookie() {
  return [
    'nimbus_session=',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/'
  ].join('; ');
}
