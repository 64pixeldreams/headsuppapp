/**
 * Create API Key endpoint
 * POST /api/keys
 */

import { Datastore } from '../../datastore/index.js';
import { generateApiKey, hashApiKey } from '../../auth/utils/api-keys.js';
import { LOGS } from '../../logs/index.js';

/**
 * Create a new API key
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {Object} auth - Auth context from middleware
 * @returns {Promise<Response>}
 */
export async function createKey(request, env, ctx, auth) {
  const logger = LOGS.init('APIKEY.create');
  
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
    
    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request',
          message: 'Invalid JSON body'
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { name = 'Default Key', permissions } = body || {};
    
    logger.log('Creating API key', { 
      userId: auth.user_id,
      name 
    });
    
    // Generate new API key
    const apiKey = generateApiKey();
    const keyHash = await hashApiKey(apiKey);
    const timestamp = new Date().toISOString();
    
    // Prepare key data
    const keyData = {
      user_id: auth.user_id,
      name,
      created: timestamp,
      last_used: timestamp,
      active: true,
      permissions: permissions || auth.permissions || ['read', 'write'],
      rate_limit: auth.rate_limit || { requests: 1000, window: 3600 },
      usage: {
        requests_today: 0,
        requests_total: 0
      }
    };
    
    // Store in datastore
    const datastore = new Datastore(env).auth(auth.user_id);
    await datastore.put('APIKEY', keyHash, keyData);
    
    // Add to user's API keys list
    await datastore.queryListAddItem('apikeys', auth.user_id, keyHash);
    
    logger.log('API key created', { 
      userId: auth.user_id,
      keyHash,
      name 
    });
    
    // Return the key (only time user sees it)
    return new Response(
      JSON.stringify({ 
        success: true,
        api_key: apiKey,
        key_hash: keyHash,
        name,
        created: timestamp,
        message: 'Save this API key securely. It will not be shown again.'
      }), 
      { 
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    logger.error('Failed to create API key', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to create API key'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
