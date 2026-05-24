/**
 * Core DataModel class
 * Provides unified interface for KV and D1 storage
 */

import { generatePrefixedId } from '../utils/uuid.js';
import { validateFields } from '../utils/validator.js';
import { prepareKVData, prepareD1Data, buildInsertQuery, buildUpdateQuery } from '../utils/sync.js';
import { executeHook } from '../hooks/manager.js';
import { QueryBuilder } from './query-builder.js';
import { generateTableSchema, generateCompleteSchema } from '../utils/schema-generator.js';
import { initializeDatabase } from '../utils/table-manager.js';

// Model registry
export const modelRegistry = new Map();

export class DataModel {
  constructor(modelName, datastore, logger) {
    this.modelName = modelName;
    this.datastore = datastore;
    this.logger = logger?.init(`datamodel.${modelName}`);
    
    // Get model definition
    this.modelDef = modelRegistry.get(modelName);
    if (!this.modelDef) {
      throw new Error(`Model ${modelName} not registered`);
    }
    
    // ✅ ADD PRIMARY KEY VALIDATION
    const primaryKey = Object.entries(this.modelDef.fields || {})
      .find(([_, config]) => config.primary)?.[0];
    
    if (!primaryKey) {
      throw new Error(`
❌ Model ${modelName} missing primary key field!

Required format:
fields: {
  ${modelName.toLowerCase()}_id: {
    type: 'string',
    primary: true,
    auto: true,
    prefix: '${modelName.toLowerCase().substring(0,3)}'
  },
  // ... other fields
}
      `);
    }
    
    // Initialize data
    this.data = {};
    this.originalData = {};
    this.isNewRecord = true;
    
    // Add default values
    this.applyDefaults();
  }
  
  /**
   * Register a model definition
   */
  static register(modelDef) {
    if (!modelDef.name) {
      throw new Error('Model must have a name');
    }
    
    // ✅ ADD PRIMARY KEY VALIDATION
    const primaryKey = Object.entries(modelDef.fields || {})
      .find(([_, config]) => config.primary)?.[0];
    
    if (!primaryKey) {
      throw new Error(`
❌ Model ${modelDef.name} missing primary key field!

Required format:
fields: {
  ${modelDef.name.toLowerCase()}_id: {
    type: 'string',
    primary: true,
    auto: true,
    prefix: '${modelDef.name.toLowerCase().substring(0,3)}'
  },
  // ... other fields
}
      `);
    }
    
    // Auto-add deleted_at field if soft delete is enabled
    if ((modelDef.options?.softDelete || modelDef.softDelete) && !modelDef.fields.deleted_at) {
      modelDef.fields.deleted_at = {
        type: 'timestamp',
        required: false,
        auto: true,
        description: 'Soft delete timestamp'
      };
    }
    
    modelRegistry.set(modelDef.name, modelDef);
  }
  
  /**
   * Alias for register to match existing code
   */
  static registerModel(modelDef) {
    return this.register(modelDef);
  }
  
  /**
   * Generate SQL schema for a specific model
   */
  static generateSchema(modelName) {
    const modelDef = modelRegistry.get(modelName);
    if (!modelDef) {
      throw new Error(`Model ${modelName} not registered`);
    }
    return generateTableSchema(modelDef);
  }
  
  /**
   * Generate SQL schema for all registered models
   */
  static generateAllSchemas() {
    return generateCompleteSchema(modelRegistry);
  }
  
  /**
   * Get model definition
   */
  static getDefinition(modelName) {
    return modelRegistry.get(modelName);
  }
  
  /**
   * Create new instance with data
   */
  static async create(modelName, datastore, data, logger) {
    // Validate model is registered
    if (!modelRegistry.has(modelName)) {
      throw new Error(`Model ${modelName} not registered. Available models: ${Array.from(modelRegistry.keys()).join(', ')}`);
    }
    
    const instance = new DataModel(modelName, datastore, logger);
    instance.set(data);
    await instance.save();
    return instance;
  }
  
  /**
   * Get single record
   */
  static async get(modelName, datastore, id, logger) {
    // Validate model is registered
    if (!modelRegistry.has(modelName)) {
      throw new Error(`Model ${modelName} not registered. Available models: ${Array.from(modelRegistry.keys()).join(', ')}`);
    }
    
    const instance = new DataModel(modelName, datastore, logger);
    await instance.load(id);
    return instance;
  }
  
  /**
   * Delete by ID
   */
  static async delete(modelName, datastore, id, logger) {
    const instance = await DataModel.get(modelName, datastore, id, logger);
    await instance.delete();
    return true;
  }
  
  /**
   * Query builder
   */
  static query(modelName, datastore, logger) {
    // Validate model is registered
    if (!modelRegistry.has(modelName)) {
      throw new Error(`Model ${modelName} not registered. Available models: ${Array.from(modelRegistry.keys()).join(', ')}`);
    }
    
    const modelDef = modelRegistry.get(modelName);
    return new QueryBuilder(modelName, modelDef, datastore, logger);
  }
  
  /**
   * Set field value(s)
   */
  set(fieldOrData, value) {
    if (typeof fieldOrData === 'string') {
      this.data[fieldOrData] = value;
    } else {
      Object.assign(this.data, fieldOrData);
    }
    return this;
  }
  
  /**
   * Get field value
   */
  get(field) {
    return this.data[field];
  }
  
  /**
   * Get all data
   */
  getData() {
    return { ...this.data };
  }
  
  /**
   * Check if new record
   */
  isNew() {
    return this.isNewRecord;
  }
  
  /**
   * Load record by ID
   */
  async load(id) {
    const timer = this.logger?.timer('load');
    
    try {
      // Get from KV
      const kvData = await this.datastore.get(this.modelName, id);
      
      if (!kvData) {
        throw new Error(`${this.modelName} ${id} not found`);
      }
      
      // Check auth
      if (!this.checkAuth(kvData)) {
        throw new Error('Unauthorized');
      }
      
      // Set data
      this.data = kvData;
      this.originalData = { ...kvData };
      this.isNewRecord = false;
      
      // Execute hook
      await executeHook(this.modelDef, 'afterGet', this, null, this.datastore.env, this.logger);
      
      timer?.end({ id });
      return this;
      
    } catch (error) {
      this.logger?.error('Load failed', error);
      timer?.end({ error: true });
      throw error;
    }
  }
  
  /**
   * Save record
   */
  async save() {
    const timer = this.logger?.timer('save');
    
    try {
      // Validate
      const validation = validateFields(this.data, this.modelDef.fields || {});
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Determine if create or update
      const isCreate = this.isNewRecord;
      const changes = this._pendingChanges || this.getChanges();
      
      
      // Execute before hook
      if (isCreate) {
        await executeHook(this.modelDef, 'beforeCreate', this, null, this.datastore.env, this.logger);
      } else {
        await executeHook(this.modelDef, 'beforeUpdate', this, changes, this.datastore.env, this.logger);
      }
      
      // Add built-in fields
      this.addBuiltInFields(isCreate);
      
      // Generate ID if needed
      const primaryKey = this.getPrimaryKey();
      if (isCreate && !this.data[primaryKey]) {
        const prefix = this.modelName.toLowerCase();
        this.data[primaryKey] = generatePrefixedId(prefix);
      }
      
      const id = this.data[primaryKey];
      
      // Prepare data
      const kvData = prepareKVData(this.data, this.modelDef);
      const d1Data = prepareD1Data(kvData, this.modelDef);
      
      // Save to KV first (source of truth)
      await this.datastore.put(this.modelName, id, kvData);
      
      // Save to D1 asynchronously (non-blocking for performance)
      if (this.modelDef.d1?.table) {
        const d1Promise = (async () => {
          try {
            if (isCreate) {
              const { query, bindings } = buildInsertQuery(this.modelDef.d1.table, d1Data);
              await this.datastore.D1.execute(query, bindings);
              this.logger?.log('D1 insert completed (async)', { model: this.modelName, id });
            } else {
              const { query, bindings } = buildUpdateQuery(
                this.modelDef.d1.table, 
                d1Data, 
                primaryKey, 
                id
              );
              await this.datastore.D1.execute(query, bindings);
              this.logger?.log('D1 update completed (async)', { model: this.modelName, id });
            }
          } catch (d1Error) {
            this.logger?.error('D1 sync failed', d1Error);
            // Continue - KV is source of truth
          }
        })();
        
        // Use waitUntil if available (Cloudflare Workers) - truly non-blocking
        if (this._waitUntil && typeof this._waitUntil === 'function') {
          this._waitUntil(d1Promise);
          this.logger?.log('D1 sync queued (non-blocking with waitUntil)', {
            model: this.modelName,
            id,
            _waitUntil: true
          });
        } else {
          // Fire and forget for local dev
          d1Promise.catch(err => this.logger?.error('D1 sync failed (fire-and-forget)', err));
          this.logger?.log('D1 sync queued (fire-and-forget)', {
            model: this.modelName,
            id,
            _waitUntil: false
          });
        }
      }
      
      // Execute after hook BEFORE updating originalData
      if (isCreate) {
        await executeHook(this.modelDef, 'afterCreate', this, null, this.datastore.env, this.logger, this._authContext);
      } else {
        await executeHook(this.modelDef, 'afterUpdate', this, changes, this.datastore.env, this.logger, this._authContext);
      }
      
      // Fire webhooks asynchronously (non-blocking)
      const webhookPromise = this._fireWebhooksAsync(isCreate ? 'create' : 'update', this.data, {
        datastore: this.datastore,
        logger: this.logger,
        authContext: this._authContext,
        waitUntil: this._waitUntil,
        user_id: this._authContext
      });
      
      // Use waitUntil if available (Cloudflare Workers) - truly non-blocking
      if (this._waitUntil && typeof this._waitUntil === 'function') {
        this._waitUntil(webhookPromise);
        this.logger?.log('Webhooks queued (non-blocking with waitUntil)', {
          eventType: isCreate ? 'create' : 'update',
          model: this.modelName,
          _waitUntil: true
        });
      } else {
        // Fire and forget - log errors but don't block
        webhookPromise.catch(err => this.logger?.error('Webhook fire failed', err));
        this.logger?.log('Webhooks queued (fire-and-forget)', {
          eventType: isCreate ? 'create' : 'update',
          model: this.modelName,
          _waitUntil: false
        });
      }
      
      // Update state AFTER hooks are executed
      this.originalData = { ...this.data };
      this.isNewRecord = false;
      
      // Clear pending changes after hooks
      this._pendingChanges = null;
      
      timer?.end({ id, action: isCreate ? 'create' : 'update' });
      return this;
      
    } catch (error) {
      this.logger?.error('Save failed', error);
      timer?.end({ error: true });
      throw error;
    }
  }
  
  /**
   * Delete record (soft delete)
   */
  async delete() {
    if (this.isNewRecord) {
      throw new Error('Cannot delete unsaved record');
    }
    
    const timer = this.logger?.timer('delete');
    
    try {
      // Execute before hook
      await executeHook(this.modelDef, 'beforeDelete', this, null, this.datastore.env, this.logger);
      
      // Soft delete
      this.data.deleted_at = new Date().toISOString();
      await this.save();
      
      // Execute after hook
      await executeHook(this.modelDef, 'afterDelete', this, null, this.datastore.env, this.logger);
      
      timer?.end({ id: this.data[this.getPrimaryKey()] });
      return this;
      
    } catch (error) {
      this.logger?.error('Delete failed', error);
      timer?.end({ error: true });
      throw error;
    }
  }
  
  /**
   * Restore soft-deleted record
   */
  async restore() {
    if (this.isNewRecord) {
      throw new Error('Cannot restore unsaved record');
    }
    
    this.data.deleted_at = null;
    await this.save();
    return this;
  }
  
  /**
   * Apply default values
   */
  applyDefaults() {
    const fields = this.modelDef.fields || {};
    
    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      if (fieldDef.default !== undefined && this.data[fieldName] === undefined) {
        this.data[fieldName] = fieldDef.default;
      }
    }
  }
  
  /**
   * Add built-in fields
   */
  addBuiltInFields(isCreate) {
    const options = this.modelDef.options || {};
    
    // User tracking
    if (options.userTracking !== false && this.datastore.authContext) {
      this.data.user_id = this.datastore.authContext;
    }
    
    // Timestamps
    if (options.timestamps !== false) {
      if (isCreate) {
        this.data.created_at = new Date().toISOString();
      }
      this.data.updated_at = new Date().toISOString();
    }
    
    // Auth array
    if (options.auth !== false && this.datastore.authContext) {
      this.data._auth = [this.datastore.authContext];
    }
  }
  
  /**
   * Get changes since last save
   */
  getChanges() {
    const changes = {};
    
    for (const [key, value] of Object.entries(this.data)) {
      if (this.originalData[key] !== value) {
        changes[key] = value;
      }
    }
    
    return changes;
  }
  
  /**
   * Check auth access
   */
  checkAuth(data) {
    // No auth context means public access
    if (!this.datastore.authContext) {
      return true;
    }
    
    // Check _auth array
    if (data._auth && Array.isArray(data._auth)) {
      // Allow explicit per-user access, plus wildcard tokens for "shared" records.
      // - '*' means accessible to any authenticated user
      // - 'public' means accessible to any authenticated user (alias)
      if (data._auth.includes('*') || data._auth.includes('public')) return true;
      return data._auth.includes(this.datastore.authContext);
    }
    
    // Check user_id
    if (data.user_id) {
      return data.user_id === this.datastore.authContext;
    }
    
    // No auth info means public
    return true;
  }
  
  /**
   * Get primary key field
   */
  getPrimaryKey() {
    for (const [fieldName, fieldDef] of Object.entries(this.modelDef.fields || {})) {
      if (fieldDef.primary) {
        return fieldName;
      }
    }
    // Default to modelname_id
    return `${this.modelName.toLowerCase()}_id`;
  }

  /**
   * Update record with changes
   */
  async update(changes) {
    if (this.isNewRecord) {
      throw new Error('Cannot update unsaved record');
    }

    const timer = this.logger?.timer('update');
    
    try {
      // Store the changes for hooks - this is what was missing!
      this._pendingChanges = { ...changes };
      
      // Apply changes
      Object.assign(this.data, changes);
      
      // Save changes
      await this.save();
      
      timer?.end({ id: this.data[this.getPrimaryKey()] });
      return this;
      
    } catch (error) {
      this.logger?.error('Update failed', error);
      timer?.end({ error: true });
      throw error;
    }
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return { ...this.data };
  }

  /**
   * Get registered model names
   */
  static getRegisteredModels() {
    return Array.from(modelRegistry.keys());
  }

  /**
   * Initialize database tables for all registered models
   * 
   * ⚠️  IMPORTANT: Call this after adding new models or changing D1 schemas!
   * 
   * This method:
   * - Auto-creates D1 tables from model definitions
   * - Updates existing tables if schema changes
   * - Only affects models with d1.table configuration
   * 
   * Usage:
   * 1. Register new model: DataModel.registerModel(MyModel)
   * 2. Deploy worker: npx wrangler deploy
   * 3. Initialize tables: Call system.initialize CloudFunction
   * 
   * CloudFunction call:
   * POST /api/function
   * { "action": "system.initialize", "data": {} }
   * 
   * Or use test script: node test-initialize-db.js
   * 
   * @param {object} datastore - Datastore instance
   * @param {object} logger - Logger instance
   * @returns {Promise<object>} Initialization result
   */
  static async initialize(datastore, logger) {
    return await initializeDatabase(modelRegistry, datastore, logger);
  }
  
  /**
   * Fire webhooks asynchronously for model events
   * @param {string} action - 'create', 'update', or 'delete'
   * @param {object} data - Model data
   * @param {object} context - Request context
   * @private
   */
  async _fireWebhooksAsync(action, data, context) {
    try {
      // CRITICAL: Exclude LOG model to prevent infinite loops
      if (this.modelName === 'LOG') {
        return;
      }
      
      // Build event type: model.action (e.g., 'page.updated', 'project.created')
      const eventType = `${this.modelName.toLowerCase()}.${action}d`; // created, updated, deleted
      
      // Only fire webhooks if user_id exists (no webhooks for system operations)
      if (!data.user_id) {
        return;
      }

      // Import WebhookTrigger dynamically to avoid circular dependencies
      const { WebhookTrigger } = await import('../../webhooks/core/webhook-trigger.js');
      
      // Fire webhooks synchronously for proper audit logging (Option B)
      await WebhookTrigger.fireWebhooks(eventType, data, context, false);
      
    } catch (error) {
      // Webhook failures should not affect model operations
      this.logger?.error('Webhook firing failed', {
        model: this.modelName,
        action,
        error: error.message
      });
    }
  }
}
