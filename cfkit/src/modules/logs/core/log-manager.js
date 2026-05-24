/**
 * Log Manager
 * Core business logic for audit log operations
 * Follows the same pattern as ProjectManager and PageManager
 */

import { DataModel } from '../../datamodel/index.js';
import { LogModel } from '../../../models/log.js';
import { LOGS } from '../index.js';

export class LogManager {
  constructor(env, userId = null) {
    this.env = env;
    this.userId = userId;
    this.logger = LOGS.init('LOG');
    
    // Register model (following the same pattern as other managers)
    DataModel.registerModel(LogModel);
  }

  /**
   * Create a new audit log entry
   */
  async create(data) {
    const timer = this.logger.timer('create');
    
    try {
      // Initialize datastore (following the same pattern as other managers)
      const { Datastore } = await import('../../datastore/index.js');
      const datastore = new Datastore(this.env, this.logger);
      
      // Ensure LOG model is registered before creating
      DataModel.registerModel(LogModel);
      
      // Create log using DataModel
      const log = new DataModel('LOG', datastore, this.logger);
      
      // Set log data
      Object.keys(data).forEach(key => {
        log.set(key, data[key]);
      });
      
      // Save to both KV and D1
      await log.save();
      
      timer.end({ logId: data.log_id });
      return {
        success: true,
        log: log.data
      };
      
    } catch (error) {
      this.logger.error('Failed to create log', error);
      timer.end({ error: true });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get logs for a user
   */
  async getUserLogs(userId, limit = 10, entityType = null, entityId = null) {
    const timer = this.logger.timer('getUserLogs');
    
    try {
      // Initialize datastore (following the same pattern as other managers)
      const { Datastore } = await import('../../datastore/index.js');
      const datastore = new Datastore(this.env, this.logger);
      
      // Use direct D1 query with new entity_ids field
      let query = 'SELECT * FROM audit_logs WHERE user_id = ?';
      const bindings = [userId];
      
      if (entityType) {
        query += ' AND entity_type = ?';
        bindings.push(entityType);
      }
      
      if (entityId) {
        // Check if entityId is in the entity_ids JSON array
        query += ' AND JSON_EXTRACT(entity_ids, "$") LIKE ?';
        bindings.push(`%"${entityId}"%`);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ?';
      bindings.push(limit);
      
      const result = await datastore.D1.execute(query, bindings);
      const logs = result.results || [];
      
      timer.end({ count: logs.length });
      return logs;
      
    } catch (error) {
      this.logger.error('Failed to get user logs', error);
      timer.end({ error: true });
      return [];
    }
  }

  /**
   * Get logs for a specific entity
   */
  async getEntityLogs(entityType, entityId, limit = 10) {
    const timer = this.logger.timer('getEntityLogs');
    
    try {
      // Initialize datastore (following the same pattern as other managers)
      const { Datastore } = await import('../../datastore/index.js');
      const datastore = new Datastore(this.env, this.logger);
      
      // Ensure LOG model is registered before querying
      DataModel.registerModel(LogModel);
      
      const query = DataModel.query('LOG', datastore, this.logger);
      query.where('entity_type', entityType);
      query.where('entity_id', entityId);
      query.orderBy('created_at', 'DESC');
      query.limit(limit);
      
      const result = await query.list();
      const logs = result.data || [];
      
      timer.end({ count: logs.length });
      return logs;
      
    } catch (error) {
      this.logger.error('Failed to get entity logs', error);
      timer.end({ error: true });
      return [];
    }
  }
}
