/**
 * Get API Key Info endpoint
 * GET /api/keys/:keyHash
 */

import { Datastore } from '../../datastore/index.js';
import { LOGS } from '../../logs/index.js';

/**
 * Get info about a specific API key
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {Object} auth - Auth context from middleware
 * @param {Object} params - Route params with keyHash
 * @returns {Promise<Response>}
 */
export async function getKeyInfo(request, env, ctx, auth, params = {}) {
  const logger = LOGS.init('APIKEY.info');
  
  try {
    // Auth required
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
    
    // Get key hash from URL
    const keyHash = params.keyHash;
    
    if (!keyHash) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request',
          message: 'Key hash required'
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    logger.debug('Getting API key info', { 
      userId: auth.user_id,
      keyHash 
    });
    
    // Get key data
    const datastore = new Datastore(env).auth(auth.user_id);
    const keyData = await datastore.get('APIKEY', keyHash);
    
    if (!keyData) {
      return new Response(
        JSON.stringify({ 
          error: 'Not Found',
          message: 'API key not found'
        }), 
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Verify ownership
    if (keyData.user_id !== auth.user_id) {
      logger.warn('Unauthorized info access', { 
        userId: auth.user_id,
        keyOwner: keyData.user_id 
      });
      return new Response(
        JSON.stringify({ 
          error: 'Forbidden',
          message: 'You can only view your own API keys'
        }), 
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Prepare response
    const response = {
      key_hash: keyHash,
      key_preview: `sk_live_${keyHash.substring(0, 8)}...`,
      name: keyData.name,
      created: keyData.created,
      last_used: keyData.last_used,
      active: keyData.active,
      permissions: keyData.permissions,
      rate_limit: keyData.rate_limit,
      usage: keyData.usage
    };
    
    // Add revoked date if applicable
    if (keyData.revoked) {
      response.revoked = keyData.revoked;
    }
    
    // Add current key indicator
    if (auth.type === 'api' && auth.key_id === keyHash) {
      response.is_current = true;
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        key: response
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    logger.error('Failed to get API key info', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to get API key info'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
