/**
 * KV Adapter for Datastore
 * Implements storage operations using Cloudflare KV
 * See specs/00-datastore.md for implementation details
 */

import { makeKey, validateClass } from '../utils/keys.js';
import { addAuthContext, checkAuthAccess } from '../utils/auth.js';

export class KVAdapter {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger?.init('KV') || null;
    this.authContext = null;
  }

  /**
   * Set auth context for all operations
   * @param {string} userId - User ID for access control
   */
  setAuthContext(userId) {
    this.authContext = userId;
  }

  /**
   * Get KV namespace for a given class
   * @param {string} className - Entity class name
   * @returns {KVNamespace} Cloudflare KV namespace
   */
  getNamespace(className) {
    const mapping = this.getKVMapping();
    
    if (!mapping[className]) {
      throw new Error(`Unknown class: ${className}. Please ensure the KV namespace is configured in wrangler.toml and added to the namespace mapping.`);
    }
    
    return mapping[className];
  }

  /**
   * Get KV namespace mapping dynamically
   * @returns {Object} KV namespace mapping
   */
  getKVMapping() {
    const mapping = {};
    
    // Auto-detect from environment variables
    Object.keys(this.env).forEach(key => {
      if (key.endsWith('S') && key !== 'SESSIONS') {
        const modelName = key.replace('S', '');
        mapping[modelName] = this.env[key];
      }
    });
    
    // Add common ones. Heads Up keeps Cloudflare resource bindings scoped with
    // HEADSUPP_* names, while older CFKit apps use the generic names.
    mapping.USER = this.env.USERS || this.env.HEADSUPP_USERS;
    mapping.APIKEY = this.env.KEYS || this.env.HEADSUPP_KEYS;
    mapping.SESSION = this.env.SESSIONS || this.env.HEADSUPP_SESSIONS;
    mapping.CACHE = this.env.CACHE || this.env.HEADSUPP_CACHE;
    
    // Add special cases that use CACHE namespace
    mapping.LOG = mapping.CACHE;
    mapping.VERIFY = mapping.CACHE;
    mapping.NOTIFICATION = mapping.CACHE;
    mapping.WEBHOOK_CONFIG = mapping.CACHE;
    mapping.WEBHOOK_QUEUE = mapping.CACHE;
    mapping.DEMO = mapping.CACHE;
    mapping.PAGE_ASSET = mapping.CACHE;  // Add your new model here

    // Foretic Oracle (CFKit app models) — store in shared CACHE namespace
    mapping.ORACLE_DATASET = mapping.CACHE;
    mapping.ORACLE_JOB = mapping.CACHE;
    mapping.ORACLE_FORECAST = mapping.CACHE;
    mapping.ORACLE_FEED = mapping.CACHE;
    mapping.ORACLE_SNAPSHOT = mapping.CACHE;
    mapping.ORACLE_SETTLEMENT = mapping.CACHE;
    mapping.ORACLE_HUMAN_PREDICTION = mapping.CACHE;
    mapping.ORACLE_HUMAN_SETTLEMENT = mapping.CACHE;
    mapping.ORACLE_POSITION = mapping.CACHE;
    mapping.ORACLE_SHARE = mapping.CACHE;
    mapping.ORACLE_DASHBOARD = mapping.CACHE;
    mapping.ORACLE_DASHBOARD_WIDGET = mapping.CACHE;
    mapping.ORACLE_CONNECTOR = mapping.CACHE;
    mapping.ORACLE_CONNECTOR_TARGET = mapping.CACHE;
    mapping.ORACLE_CONNECTOR_RUN = mapping.CACHE;
    mapping.ORACLE_OPERATING_EVENT = mapping.CACHE;
    mapping.ORACLE_FORECAST_GOAL = mapping.CACHE;
    mapping.ORACLE_NOTIFICATION_SUBSCRIPTION = mapping.CACHE;
    mapping.ORACLE_NOTIFICATION_DELIVERY = mapping.CACHE;
    mapping.ORACLE_DATASET_ROLLUP_PLAYBOOK = mapping.CACHE;

    return mapping;
  }

  /**
   * Get an object from KV
   * @param {string} className - Entity class
   * @param {string} id - Entity ID
   * @returns {Promise<Object|null>} Object data or null if not found/no access
   */
  async get(className, id) {
    const timer = this.logger?.timer('get');
    
    try {
      validateClass(className, this.getKVMapping());
      const kv = this.getNamespace(className);
      const key = makeKey(className, id);
      
      this.logger?.debug(`Getting ${className}:${id}`, { key });
      const data = await kv.get(key, 'json');
      
      // Check auth access
      if (data && !checkAuthAccess(data, this.authContext)) {
        this.logger?.debug(`Access denied for ${className}:${id}`);
        timer?.end({ found: true, access: false });
        return null;
      }
      
      timer?.end({ found: data !== null });
      return data;
    } catch (err) {
      this.logger?.error(`Failed to get ${className}:${id}`, err);
      timer?.end({ error: true });
      throw err;
    }
  }

  /**
   * Store an object in KV
   * @param {string} className - Entity class
   * @param {string} id - Entity ID
   * @param {Object} data - Data to store
   */
  async put(className, id, data) {
    const timer = this.logger?.timer('put');
    
    try {
      validateClass(className, this.getKVMapping());
      const kv = this.getNamespace(className);
      const key = makeKey(className, id);
      
      // Add auth context
      const dataWithAuth = addAuthContext(data, this.authContext);
      
      this.logger?.debug(`Storing ${className}:${id}`, { key });
      await kv.put(key, JSON.stringify(dataWithAuth));
      
      timer?.end({ success: true });
    } catch (err) {
      this.logger?.error(`Failed to put ${className}:${id}`, err);
      timer?.end({ error: true });
      throw err;
    }
  }

  /**
   * Delete an object from KV
   * @param {string} className - Entity class
   * @param {string} id - Entity ID
   */
  async delete(className, id) {
    validateClass(className, this.getKVMapping());
    const kv = this.getNamespace(className);
    const key = makeKey(className, id);
    
    // Check if user has access before deleting
    const existing = await this.get(className, id);
    if (!existing) {
      throw new Error('Not found or no access');
    }
    
    await kv.delete(key);
  }

  /**
   * Check if an object exists
   * @param {string} className - Entity class
   * @param {string} id - Entity ID
   * @returns {Promise<boolean>} True if exists and user has access
   */
  async exists(className, id) {
    const data = await this.get(className, id);
    return data !== null;
  }

  // List operations (stored as arrays in KV)

  /**
   * Get list items
   * @param {string} listName - List name (e.g., 'projects')
   * @param {string} pointer - List pointer (e.g., user ID)
   * @returns {Promise<Array>} List items
   */
  async queryListByPointer(listName, pointer) {
    // Lists use special key format: listName:pointer
    const key = `${listName}:${pointer}`;
    const kv = this.env.NIMBUS_LISTS || this.env.HEADSUPP_LISTS; // All lists stored in dedicated namespace
    
    const list = await kv.get(key, 'json');
    return list || [];
  }

  /**
   * Add item to list
   * @param {string} listName - List name
   * @param {string} pointer - List pointer
   * @param {string} itemId - Item to add
   */
  async queryListAddItem(listName, pointer, itemId) {
    const list = await this.queryListByPointer(listName, pointer);
    
    if (!list.includes(itemId)) {
      list.push(itemId);
      const key = `${listName}:${pointer}`;
      const kv = this.env.NIMBUS_LISTS || this.env.HEADSUPP_LISTS;
      await kv.put(key, JSON.stringify(list));
    }
  }

  /**
   * Remove item from list
   * @param {string} listName - List name
   * @param {string} pointer - List pointer
   * @param {string} itemId - Item to remove
   */
  async queryListRemoveItem(listName, pointer, itemId) {
    const list = await this.queryListByPointer(listName, pointer);
    
    const index = list.indexOf(itemId);
    if (index > -1) {
      list.splice(index, 1);
      const key = `${listName}:${pointer}`;
      const kv = this.env.NIMBUS_LISTS || this.env.HEADSUPP_LISTS;
      await kv.put(key, JSON.stringify(list));
    }
  }

  /**
   * Clear entire list
   * @param {string} listName - List name
   * @param {string} pointer - List pointer
   */
  async queryListClear(listName, pointer) {
    const key = `${listName}:${pointer}`;
    const kv = this.env.NIMBUS_LISTS || this.env.HEADSUPP_LISTS;
    await kv.delete(key);
  }
}
