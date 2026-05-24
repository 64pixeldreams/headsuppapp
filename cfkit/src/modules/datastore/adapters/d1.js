/**
 * D1 Adapter for Datastore
 * Implements storage operations using Cloudflare D1
 * See specs/00-datastore.md for implementation details
 */

import { validateClass } from '../utils/keys.js';
import { addAuthContext, checkAuthAccess } from '../utils/auth.js';

export class D1Adapter {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger?.init('D1') || null;
    this.authContext = null;
    this.db = env.DB; // D1 database binding
  }

  /**
   * Set auth context for all operations
   * @param {string} userId - User ID for access control
   */
  setAuthContext(userId) {
    this.authContext = userId;
  }

  /**
   * Get table name for a given class
   * @param {string} className - Entity class name
   * @returns {string} Table name
   */
  getTableName(className) {
    // Static mappings for system classes
    const staticMapping = {
      'LOG': 'logs',
      'AUDIT': 'audit_trail',
      'BATCH': 'batches',
      'QUEUE': 'queue_items',
      'STATUS': 'job_status'
    };
    
    // Check static mapping first
    if (staticMapping[className]) {
      return staticMapping[className];
    }
    
    // Dynamic mapping for DataModel classes
    // Convert class name to table name (e.g., 'USER' -> 'users')
    const tableName = className.toLowerCase() + 's';
    
    // Validate table name format
    if (!/^[a-z_]+$/.test(tableName)) {
      throw new Error(`Invalid table name generated for class ${className}: ${tableName}`);
    }
    
    return tableName;
  }

  /**
   * Get an object from D1
   * @param {string} className - Entity class
   * @param {string} id - Entity ID
   * @returns {Promise<Object|null>} Object data or null if not found/no access
   */
  async get(className, id) {
    validateClass(className);
    const table = this.getTableName(className);
    
    const result = await this.db
      .prepare(`SELECT * FROM ${table} WHERE id = ?`)
      .bind(id)
      .first();
    
    if (!result) return null;
    
    // Parse JSON data field if present
    if (result.data && typeof result.data === 'string') {
      result.data = JSON.parse(result.data);
    }
    
    // Check auth access
    if (!checkAuthAccess(result, this.authContext)) {
      return null;
    }
    
    return result;
  }

  /**
   * Store an object in D1
   * @param {string} className - Entity class
   * @param {string} id - Entity ID
   * @param {Object} data - Data to store
   */
  async put(className, id, data) {
    validateClass(className);
    const table = this.getTableName(className);
    
    // Add auth context
    const dataWithAuth = addAuthContext(data, this.authContext);
    
    // Prepare data for storage
    const { _auth, ...cleanData } = dataWithAuth;
    const jsonData = JSON.stringify(cleanData);
    const authJson = JSON.stringify(_auth || []);
    
    // Upsert operation
    await this.db
      .prepare(`
        INSERT INTO ${table} (id, data, _auth, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          _auth = excluded._auth,
          updated_at = datetime('now')
      `)
      .bind(id, jsonData, authJson)
      .run();
  }

  /**
   * Delete an object from D1
   * @param {string} className - Entity class
   * @param {string} id - Entity ID
   */
  async delete(className, id) {
    validateClass(className);
    const table = this.getTableName(className);
    
    // Check if user has access before deleting
    const existing = await this.get(className, id);
    if (!existing) {
      throw new Error('Not found or no access');
    }
    
    await this.db
      .prepare(`DELETE FROM ${table} WHERE id = ?`)
      .bind(id)
      .run();
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

  // List operations for D1 (future enhancement)
  // These would use separate list tables or JSON columns
  
  async queryListByPointer(listName, pointer) {
    // TODO: Implement D1 list queries
    throw new Error('D1 list operations not yet implemented');
  }

  async queryListAddItem(listName, pointer, itemId) {
    throw new Error('D1 list operations not yet implemented');
  }

  async queryListRemoveItem(listName, pointer, itemId) {
    throw new Error('D1 list operations not yet implemented');
  }

  async queryListClear(listName, pointer) {
    throw new Error('D1 list operations not yet implemented');
  }
  
  /**
   * Execute raw SQL query
   * @param {string} query - SQL query
   * @param {array} bindings - Query parameters
   */
  async execute(query, bindings = []) {
    const timer = this.logger?.timer('d1.execute');
    
    try {
      const stmt = this.db.prepare(query);
      const result = bindings.length > 0 
        ? await stmt.bind(...bindings).all()
        : await stmt.all();
        
      timer?.end({ rows: result.results?.length || 0 });
      return result;
    } catch (error) {
      this.logger?.error('D1 execute failed', error);
      timer?.end({ error: true });
      throw error;
    }
  }
}
