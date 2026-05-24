/**
 * Revoke API Key endpoint
 * DELETE /api/keys/:keyHash
 */

import { Datastore } from '../../datastore/index.js';
import { LOGS } from '../../logs/index.js';

/**
 * Revoke an API key
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {Object} auth - Auth context from middleware
 * @param {Object} params - Route params with keyHash
 * @returns {Promise<Response>}
 */
export async function revokeKey(request, env, ctx, auth, params = {}) {
  const logger = LOGS.init('APIKEY.revoke');
  
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
    
    // Get key hash from URL or body
    let keyHash = params.keyHash;
    
    if (!keyHash && request.method === 'DELETE') {
      try {
        const body = await request.json();
        keyHash = body.key_hash;
      } catch (error) {
        // No body or invalid JSON is ok if keyHash is in URL
      }
    }
    
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
    
    logger.log('Revoking API key', { 
      userId: auth.user_id,
      keyHash 
    });
    
    // Get key data to verify ownership
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
      logger.warn('Unauthorized revoke attempt', { 
        userId: auth.user_id,
        keyOwner: keyData.user_id 
      });
      return new Response(
        JSON.stringify({ 
          error: 'Forbidden',
          message: 'You can only revoke your own API keys'
        }), 
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Don't allow revoking the key being used for auth
    if (auth.type === 'api' && auth.key_id === keyHash) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request',
          message: 'Cannot revoke the API key used for this request'
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Update key to inactive
    keyData.active = false;
    keyData.revoked = new Date().toISOString();
    await datastore.put('APIKEY', keyHash, keyData);
    
    // Remove from user's active keys list
    await datastore.queryListRemoveItem('apikeys', auth.user_id, keyHash);
    
    logger.log('API key revoked', { 
      userId: auth.user_id,
      keyHash,
      name: keyData.name 
    });
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'API key revoked successfully',
        key_hash: keyHash,
        name: keyData.name
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    logger.error('Failed to revoke API key', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to revoke API key'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
