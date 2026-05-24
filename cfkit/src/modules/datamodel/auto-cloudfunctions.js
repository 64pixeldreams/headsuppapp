/**
 * Auto CloudFunctions Registration System
 * 
 * Automatically creates CRUD CloudFunctions for any DataModel
 * Eliminates boilerplate code for standard model operations
 */

import { DataModel } from '../datamodel/index.js';
import { Datastore } from '../datastore/index.js';
import { LOGS } from '../logs/index.js';

/**
 * Auto CloudFunction Registry
 * Manages automatic CloudFunction creation for DataModels
 */
class AutoCloudFunctionRegistry {
  constructor() {
    this.registeredModels = new Map();
    this.cloudFunction = null;
  }

  /**
   * Register a model for auto CloudFunction generation
   * @param {Object} model - DataModel definition
   * @param {Object} options - Registration options
   */
  registerModel(model, options = {}) {
    const {
      auth = false,
      excludeFunctions = [],
      customFunctions = {}
    } = options;

    // Validate model structure
    if (!model.name || !model.fields) {
      throw new Error('Model must have name and fields properties');
    }

    // Store model configuration
    this.registeredModels.set(model.name, {
      model,
      auth,
      excludeFunctions,
      customFunctions
    });

    console.log(`✅ Auto-registered model: ${model.name}`);
  }

  /**
   * Register all models with CloudFunction system
   * @param {Object} cloudFunction - CloudFunction instance
   */
  async registerWithCloudFunction(cloudFunction) {
    this.cloudFunction = cloudFunction;

    for (const [modelName, config] of this.registeredModels) {
      await this._registerModelCloudFunctions(modelName, config);
    }
  }

  /**
   * Register CloudFunctions for a specific model
   * @private
   */
  async _registerModelCloudFunctions(modelName, config) {
    const { model, auth, excludeFunctions, customFunctions } = config;
    const functionPrefix = modelName.toLowerCase();

    // Register standard CRUD functions
    const standardFunctions = ['get', 'list', 'create', 'update', 'delete'];
    
    for (const funcName of standardFunctions) {
      if (excludeFunctions.includes(funcName)) {
        continue;
      }

      const cloudFunctionName = `${functionPrefix}.${funcName}`;
      const handler = this._createHandler(modelName, funcName);
      const config = this._createConfig(funcName, auth, model);

      this.cloudFunction.define(cloudFunctionName, handler, config);
      console.log(`  ✅ Registered: ${cloudFunctionName}`);
    }

    // Register custom functions
    for (const [funcName, funcConfig] of Object.entries(customFunctions)) {
      const cloudFunctionName = `${functionPrefix}.${funcName}`;
      this.cloudFunction.define(cloudFunctionName, funcConfig.handler, funcConfig.config);
      console.log(`  ✅ Registered custom: ${cloudFunctionName}`);
    }
  }

  /**
   * Create handler function for a model operation
   * @private
   */
  _createHandler(modelName, operation) {
    return async (requestContext) => {
      const { payload, env, auth, logger } = requestContext;

      try {
        switch (operation) {
          case 'get':
            return await this._handleGet(modelName, payload, env, auth);
          case 'list':
            return await this._handleList(modelName, payload, env, auth);
          case 'create':
            return await this._handleCreate(modelName, payload, env, auth);
          case 'update':
            return await this._handleUpdate(modelName, payload, env, auth);
          case 'delete':
            return await this._handleDelete(modelName, payload, env, auth);
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        console.error(`Error in ${modelName}.${operation}:`, error);
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message
          }
        };
      }
    };
  }

  /**
   * Create configuration for a CloudFunction
   * @private
   */
  _createConfig(operation, auth, model = null) {
    const config = {
      auth: auth,
      validation: {}
    };

    // Add operation-specific validation
    switch (operation) {
      case 'get':
        config.validation = {
          id: { type: 'string', required: true }
        };
        break;
      case 'list':
        config.validation = {
          page: { type: 'number', default: 1 },
          pageSize: { type: 'number', default: 20 },
          sort: { type: 'string', default: 'created_at' },
          order: { type: 'string', default: 'desc' },
          filter: { type: 'object', default: {} }
        };
        break;
      case 'create':
        // Generate validation from model fields
        if (model && model.fields) {
          Object.entries(model.fields).forEach(([fieldName, fieldDef]) => {
            // Skip auto-generated fields
            if (fieldDef.auto) return;
            
            config.validation[fieldName] = {
              type: fieldDef.type,
              required: fieldDef.required || false,
              default: fieldDef.default
            };
            
            // Add validation rules
            if (fieldDef.enum) {
              config.validation[fieldName].validation = fieldDef.enum;
            }
            if (fieldDef.minLength || fieldDef.maxLength) {
              config.validation[fieldName].validation = {
                minLength: fieldDef.minLength,
                maxLength: fieldDef.maxLength
              };
            }
            if (fieldDef.min !== undefined || fieldDef.max !== undefined) {
              config.validation[fieldName].validation = {
                min: fieldDef.min,
                max: fieldDef.max
              };
            }
          });
        }
        break;
      case 'update':
        config.validation = {
          id: { type: 'string', required: true }
        };
        // For update, fields are optional so we don't add field validation
        break;
      case 'delete':
        config.validation = {
          id: { type: 'string', required: true }
        };
        break;
    }

    return config;
  }

  /**
   * Handle GET operation
   * @private
   */
  async _handleGet(modelName, payload, env, auth) {
    const { id } = payload;
    
    try {
      const logger = LOGS.init(`auto-cloudfunction.${modelName}.get`);
      const datastore = new Datastore(env, logger);
      const instance = await DataModel.get(modelName, datastore, id, logger);
      
      if (!instance || !instance.data || Object.keys(instance.data).length === 0) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `${modelName} not found`
          }
        };
      }

      return {
        success: true,
        data: instance.data
      };
    } catch (error) {
      console.error(`GET ${modelName} error:`, error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      };
    }
  }

  /**
   * Handle LIST operation
   * 🔒 SECURITY: Automatic user_id filtering for user-scoped models
   * @private
   */
  async _handleList(modelName, payload, env, auth) {
    const { page = 1, pageSize = 20, sort = 'created_at', order = 'desc', filter = {} } = payload;
    
    try {
      const logger = LOGS.init(`auto-cloudfunction.${modelName}.list`);
      const datastore = new Datastore(env, logger);
      const query = DataModel.query(modelName, datastore, logger);
      
      // --- SECURITY: USER_ID FILTERING ---
      let skipUserIdFilter = false;
      const modelDef = DataModel.getDefinition(modelName);
      
      // Check for admin bypass (requires auth check)
      if (payload._bypassUserFilterAdmin === true) {
        const isAdmin = auth?.is_admin === true;
        
        if (!isAdmin) {
          logger.error('❌ Unauthorized admin bypass attempt', {
            user_id: auth?.user_id,
            email: auth?.email,
            model: modelName
          });
          return { 
            success: false, 
            error: { 
              message: 'Admin privileges required',
              code: 'UNAUTHORIZED_BYPASS'
            } 
          };
        }
        
        logger.warn('🔓 Admin user_id filter bypass enabled', {
          admin_user: auth.email,
          admin_id: auth.user_id,
          model: modelName
        });
        
        skipUserIdFilter = true;
      }
      // Check for server-side bypass (no auth check needed)
      else if (payload._bypassUserFilter === true) {
        logger.warn('⚠️ Server-side user_id filter bypass enabled', {
          caller: 'server-cloudfunction',
          auth_user: auth?.email || 'system',
          model: modelName
        });
        
        skipUserIdFilter = true;
      }
      // Default: Enforce user_id filtering
      else {
        // Remove any user_id filter from client request
        if (filter?.user_id) {
          logger.warn('🚨 Blocked user_id filter from client request', {
            requested_user_id: filter.user_id,
            auth_user_id: auth?.user_id,
            model: modelName
          });
          delete filter.user_id;
        }
        
        // Check if model has user_id field
        const hasUserIdField = modelDef?.fields?.user_id || modelDef?.fields?.created_by;
        
        // If model tracks users AND user is authenticated → Force filter
        if (hasUserIdField && auth?.user_id) {
          query.where('user_id', auth.user_id);
        // CFKit Logger uses .log() for info-level (there is no .info()).
        logger.log(`🔒 Auto-applied user_id filter: ${auth.user_id} for ${modelName}`);
        }
      }
      
      // --- END SECURITY BLOCK ---
      
      // Apply remaining filters
      if (filter && Object.keys(filter).length > 0) {
        Object.entries(filter).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query.whereIn(key, value);
          } else {
            query.where(key, value);
          }
        });
      }
      
      // Apply sorting
      query.orderBy(sort, order);
      
      // Apply pagination
      query.limit(parseInt(pageSize));
      query.offset((parseInt(page) - 1) * parseInt(pageSize));
      
      // ✅ FIX: Don't hydrate from KV for list queries!
      // D1 syncFields already contain all data needed for list display.
      // KV should only be fetched for individual .get() operations.
      // query.withData(); // ← REMOVED - causes expensive KV lookups for every record
      
      // Execute query (returns DataProxy instances with D1 data only)
      const queryResult = await query.list();
      
      return {
        success: true,
        data: {
          data: queryResult.data.map(instance => instance.toJSON()),
          meta: {
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            total: queryResult.pagination.total,
            totalPages: queryResult.pagination.pages
          }
        }
      };
    } catch (error) {
      console.error(`LIST ${modelName} error:`, error);
      
      // Provide helpful error messages
      if (error.message.includes('no such table')) {
        return {
          success: false,
          error: {
            code: 'TABLE_NOT_FOUND',
            message: `Table for model '${modelName}' does not exist. Please run 'system.initialize' CloudFunction to create database tables.`
          }
        };
      }
      
      if (error.message.includes('Unknown class')) {
        return {
          success: false,
          error: {
            code: 'KV_NAMESPACE_NOT_FOUND',
            message: `KV namespace for model '${modelName}' is not configured. Please add the namespace to wrangler.toml and restart the worker.`
          }
        };
      }
      
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      };
    }
  }

  /**
   * Handle CREATE operation
   * @private
   */
  async _handleCreate(modelName, payload, env, auth) {
    try {
      const logger = LOGS.init(`auto-cloudfunction.${modelName}.create`);
      const datastore = new Datastore(env, logger);
      
      // Add auth context if available
      if (auth && auth.user_id) {
        payload.created_by = auth.user_id;
      }

      const instance = await DataModel.create(modelName, datastore, payload, logger);
      
      return {
        success: true,
        data: instance.data
      };
    } catch (error) {
      console.error(`CREATE ${modelName} error:`, error);
      
      // Provide helpful error messages
      if (error.message.includes('no such table')) {
        return {
          success: false,
          error: {
            code: 'TABLE_NOT_FOUND',
            message: `Table for model '${modelName}' does not exist. Please run 'system.initialize' CloudFunction to create database tables.`
          }
        };
      }
      
      if (error.message.includes('Unknown class')) {
        return {
          success: false,
          error: {
            code: 'KV_NAMESPACE_NOT_FOUND',
            message: `KV namespace for model '${modelName}' is not configured. Please ensure: 1) Add [[kv_namespaces]] binding = "${modelName.toUpperCase()}" to wrangler.toml, 2) Create the namespace with 'wrangler kv:namespace create ${modelName.toUpperCase()}', 3) Update the namespace ID in wrangler.toml`
          }
        };
      }
      
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      };
    }
  }

  /**
   * Handle UPDATE operation
   * @private
   */
  async _handleUpdate(modelName, payload, env, auth) {
    const { id, ...updateData } = payload;
    
    try {
      const logger = LOGS.init(`auto-cloudfunction.${modelName}.update`);
      const datastore = new Datastore(env, logger);
      
      // Get existing instance
      const instance = await DataModel.get(modelName, datastore, id, logger);
      
      if (!instance || !instance.data || Object.keys(instance.data).length === 0) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `${modelName} not found`
          }
        };
      }

      // Add auth context if available
      if (auth && auth.user_id) {
        updateData.updated_by = auth.user_id;
      }

      // Update and save
      instance.set(updateData);
      await instance.save();

      return {
        success: true,
        data: instance.data
      };
    } catch (error) {
      console.error(`UPDATE ${modelName} error:`, error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      };
    }
  }

  /**
   * Handle DELETE operation
   * @private
   */
  async _handleDelete(modelName, payload, env, auth) {
    const { id } = payload;
    
    try {
      const logger = LOGS.init(`auto-cloudfunction.${modelName}.delete`);
      const datastore = new Datastore(env, logger);
      
      await DataModel.delete(modelName, datastore, id, logger);
      
      return {
        success: true,
        message: `${modelName} deleted successfully`
      };
    } catch (error) {
      console.error(`DELETE ${modelName} error:`, error);
      
      if (error.message.includes('not found')) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `${modelName} not found`
          }
        };
      }

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      };
    }
  }
}

// Export singleton instance
export const autoCloudFunctionRegistry = new AutoCloudFunctionRegistry();