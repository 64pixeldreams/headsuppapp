/**
 * API Key validation utilities
 */

import { Datastore } from '../../datastore/index.js';

/**
 * Validate API key and return auth context
 * @param {string} keyHash - Hashed API key
 * @param {Datastore} datastore - Datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<AuthContext|null>}
 */
export async function validateApiKeyHash(keyHash, datastore, logger) {
  const timer = logger?.timer('validateApiKeyHash');
  
  try {
    // Look up in datastore
    const keyData = await datastore.get('APIKEY', keyHash);
    
    if (!keyData) {
      timer?.end({ found: false });
      return null;
    }

    // Check if active
    if (!keyData.active) {
      logger?.debug('API key inactive', { keyHash });
      timer?.end({ active: false });
      return null;
    }

    // Update usage stats
    keyData.last_used = new Date().toISOString();
    keyData.usage = keyData.usage || { requests_today: 0, requests_total: 0 };
    keyData.usage.requests_today += 1;
    keyData.usage.requests_total += 1;
    
    // Save updated stats
    await datastore.put('APIKEY', keyHash, keyData);

    timer?.end({ success: true, userId: keyData.user_id });

    // Return auth context
    return {
      user_id: keyData.user_id,
      permissions: keyData.permissions || ['read', 'write'],
      rate_limit: keyData.rate_limit || { requests: 1000, window: 3600 },
      key_id: keyHash
    };
  } catch (err) {
    logger?.error('Failed to validate API key', err);
    timer?.end({ error: true });
    return null;
  }
}

/**
 * Hash an API key using SHA-256
 * @param {string} apiKey - Raw API key
 * @returns {Promise<string>} Hex hash
 */
export async function hashApiKey(apiKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a new API key
 * @returns {string} New API key
 */
export function generateApiKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
