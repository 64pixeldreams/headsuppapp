/**
 * List API Keys endpoint
 * GET /api/keys
 */

import { Datastore } from '../../datastore/index.js';
import { LOGS } from '../../logs/index.js';

/**
 * List all API keys for authenticated user
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {Object} auth - Auth context from middleware
 * @returns {Promise<Response>}
 */
export async function listKeys(request, env, ctx, auth) {
  const logger = LOGS.init('APIKEY.list');
  
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
    
    logger.log('Listing API keys', { userId: auth.user_id });
    
    // Get user's API key list
    const datastore = new Datastore(env).auth(auth.user_id);
    const keyHashes = await datastore.queryListByPointer('apikeys', auth.user_id);
    
    // Fetch details for each key
    const keys = await Promise.all(
      keyHashes.map(async (keyHash) => {
        const keyData = await datastore.get('APIKEY', keyHash);
        if (!keyData) return null;
        
        // Remove sensitive data and add metadata
        return {
          key_hash: keyHash,
          name: keyData.name,
          created: keyData.created,
          last_used: keyData.last_used,
          active: keyData.active,
          permissions: keyData.permissions,
          usage: keyData.usage,
          // Mask the hash for display
          key_preview: `sk_live_${keyHash.substring(0, 8)}...`
        };
      })
    );
    
    // Filter out nulls (deleted keys)
    const validKeys = keys.filter(k => k !== null);
    
    logger.log('Retrieved API keys', { 
      userId: auth.user_id,
      count: validKeys.length 
    });
    
    return new Response(
      JSON.stringify({ 
        success: true,
        keys: validKeys,
        count: validKeys.length
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    logger.error('Failed to list API keys', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to list API keys'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
