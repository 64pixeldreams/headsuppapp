/**
 * Main Datastore class
 * Implements unified interface for KV and D1 storage
 * See specs/00-datastore.md for implementation details
 */

import { KVAdapter } from '../adapters/kv.js';
import { D1Adapter } from '../adapters/d1.js';

export class Datastore {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
    this.authContext = null;
    
    // Initialize adapters
    this.KV = new KVAdapter(env, logger);
    this.D1 = new D1Adapter(env, logger);
  }

  /**
   * Create authenticated datastore instance
   * @param {string} userId - User ID for auth context
   * @returns {Datastore} New instance with auth context
   */
  auth(userId) {
    const authedStore = new Datastore(this.env, this.logger);
    authedStore.authContext = userId;
    
    // Set auth context on adapters
    authedStore.KV.setAuthContext(userId);
    authedStore.D1.setAuthContext(userId);
    
    return authedStore;
  }

  // Convenience methods that delegate to KV adapter (default)
  
  async get(className, id) {
    return this.KV.get(className, id);
  }

  async put(className, id, data) {
    return this.KV.put(className, id, data);
  }

  async delete(className, id) {
    return this.KV.delete(className, id);
  }

  async exists(className, id) {
    return this.KV.exists(className, id);
  }

  // List operations
  
  async queryListByPointer(listName, pointer) {
    return this.KV.queryListByPointer(listName, pointer);
  }

  async queryListAddItem(listName, pointer, itemId) {
    return this.KV.queryListAddItem(listName, pointer, itemId);
  }

  async queryListRemoveItem(listName, pointer, itemId) {
    return this.KV.queryListRemoveItem(listName, pointer, itemId);
  }

  async queryListClear(listName, pointer) {
    return this.KV.queryListClear(listName, pointer);
  }

  // Convenience method for getting entire lists
  async getList(className, pointer) {
    return this.KV.queryListByPointer(className, pointer);
  }
}
