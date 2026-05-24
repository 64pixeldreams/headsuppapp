/**
 * Audit Logger
 * Uses DataModel LOG to create structured audit logs in D1
 */

import { DataModel } from '../../datamodel/index.js';
import { LogModel } from '../../../models/log.js';

export class AuditLogger {
  constructor(datastore, logger) {
    this.datastore = datastore;
    this.logger = logger;
    
    // Track ongoing operations for duration calculation
    this.ongoingOperations = new Map();
    
    // Register LOG model (following the same pattern as other managers)
    DataModel.registerModel(LogModel);
  }

  /**
   * Start tracking an operation for duration calculation
   * @param {string} operationId - Unique identifier for the operation
   * @param {string} operationType - Type of operation (e.g., 'page_processing', 'summary_generation')
   * @param {object} metadata - Additional metadata about the operation
   */
  startOperation(operationId, operationType, metadata = {}) {
    const startTime = Date.now();
    this.ongoingOperations.set(operationId, {
      startTime,
      operationType,
      metadata,
      ...metadata
    });
    return startTime;
  }

  /**
   * End tracking an operation and calculate duration
   * @param {string} operationId - Unique identifier for the operation
   * @returns {number} Duration in milliseconds
   */
  endOperation(operationId) {
    const operation = this.ongoingOperations.get(operationId);
    if (!operation) {
      this.logger?.warn('Operation not found for duration calculation', { operationId });
      return null;
    }
    
    const duration = Date.now() - operation.startTime;
    this.ongoingOperations.delete(operationId);
    return duration;
  }

  /**
   * Create an audit log entry
   * @param {object} params - Log parameters
   * @param {string} params.user_id - User ID
   * @param {string} params.entity_type - Type of entity (user, project, page)
   * @param {string} params.entity_id - ID of the entity
   * @param {string} params.action - Action performed
   * @param {string} params.message - Human readable message
   * @param {string} params.level - Log level (info, warn, error)
   * @param {string} params.project_id - Project ID (if applicable)
   * @param {string} params.page_id - Page ID (if applicable)
   * @param {object} params.details - Additional details
   * @param {string} params.request_id - Request ID for correlation
   * @param {number} params.duration_ms - Duration in milliseconds
   */
  async createLog({
    user_id,
    entity_type,
    entity_id,
    action,
    message,
    level = 'info',
    entity_ids = [], // Array of any entity IDs this log relates to
    details = {},
    request_id = null,
    duration_ms = null
  }) {
    try {
      const logId = `${entity_type}_${entity_id || 'unknown'}_${Date.now()}`;
      
      // Build entity_ids array - include the main entity_id and any additional ones
      const allEntityIds = [entity_id, ...entity_ids].filter(Boolean);
      
      // Ensure we always have at least the main entity_id
      if (allEntityIds.length === 0 && entity_id) {
        allEntityIds.push(entity_id);
      }
      
      const logData = {
        log_id: logId,
        user_id,
        entity_type,
        entity_id,
        action,
        message,
        level,
        entity_ids: allEntityIds, // Use the new flexible indexing
        details: details, // Keep as object for JSON field
        request_id,
        duration_ms
      };

      // Use DataModel directly to create the log entry (simpler approach)
      DataModel.registerModel(LogModel);
      const log = new DataModel('LOG', this.datastore, this.logger);
      
      // Set log data
      Object.keys(logData).forEach(key => {
        log.set(key, logData[key]);
      });
      
      // Save to both KV and D1
      await log.save();

      this.logger?.log('Audit log created', { 
        logId, 
        action, 
        entity_type, 
        entity_id,
        entity_ids: allEntityIds
      });

      return { success: true, log: log.data };
    } catch (error) {
      this.logger?.error('Failed to create audit log', error);
      // Don't throw - audit logging shouldn't break the main operation
      return null;
    }
  }

  /**
   * Get recent audit logs for a user
   * @param {string} userId - User ID
   * @param {number} limit - Number of logs to return
   * @param {string} entityType - Filter by entity type (optional)
   * @param {string} projectId - Filter by project ID (optional)
   */
  async getUserLogs(userId, limit = 10, entityType = null, projectId = null) {
    try {
      const query = DataModel.query('LOG', this.datastore, this.logger);
      query.where('user_id', userId);
      
      if (entityType) {
        query.where('entity_type', entityType);
      }
      
      if (projectId) {
        query.where('project_id', projectId);
      }
      
      query.orderBy('created_at', 'DESC');
      query.limit(limit);
      
      const result = await query.list();
      return result.data || [];
    } catch (error) {
      this.logger?.error('Failed to get user logs', error);
      return [];
    }
  }

  /**
   * Get logs for a specific entity
   * @param {string} entityType - Type of entity
   * @param {string} entityId - ID of the entity
   * @param {number} limit - Number of logs to return
   */
  async getEntityLogs(entityType, entityId, limit = 10) {
    try {
      const query = DataModel.query('LOG', this.datastore, this.logger);
      query.where('entity_type', entityType);
      query.where('entity_id', entityId);
      query.orderBy('created_at', 'DESC');
      query.limit(limit);
      
      const result = await query.list();
      return result.data || [];
    } catch (error) {
      this.logger?.error('Failed to get entity logs', error);
      return [];
    }
  }

  /**
   * Create a user activity log
   */
  async logUserActivity(userId, action, message, details = {}) {
    return this.createLog({
      user_id: userId,
      entity_type: 'user',
      entity_id: userId,
      action,
      message,
      level: 'info',
      details,
      entity_ids: [userId] // Simple: just the user ID
    });
  }

  /**
   * Create a project activity log
   */
  async logProjectActivity(userId, projectId, action, message, details = {}) {
    return this.createLog({
      user_id: userId,
      entity_type: 'project',
      entity_id: projectId,
      action,
      message,
      level: 'info',
      details,
      entity_ids: [projectId, userId] // Simple: project + user IDs
    });
  }

  /**
   * Log webhook activity (deliveries, failures, retries)
   * @param {string} userId - User ID who triggered the webhook
   * @param {string} webhookId - Webhook configuration ID
   * @param {string} action - Action type (webhook_delivered, webhook_failed, webhook_retry)
   * @param {string} message - Human-readable message
   * @param {object} details - Additional details
   * @returns {Promise<object>} Log creation result
   */
  async logWebhookActivity(userId, webhookId, action, message, details = {}) {
    // Normalize action names to consistent format
    const normalizedAction = this.normalizeAction(action);
    const cleanMessage = this.formatMessage(message, details);
    
    return this.createLog({
      user_id: userId,
      entity_type: 'webhook',
      entity_id: webhookId,
      action: normalizedAction,
      message: cleanMessage,
      level: 'api.wh', // Webhook-specific level for filtering
      details,
      entity_ids: [
        webhookId, 
        userId,
        details.entity_id // Include the entity that triggered the webhook
      ].filter(Boolean) // Remove nulls
    });
  }

  /**
   * Create a page activity log with improved action naming
   */
  async logPageActivity(userId, pageId, projectId, action, message, details = {}) {
    // Normalize action names to AIVERIE style
    const normalizedAction = this.normalizeAction(action);
    const cleanMessage = this.formatMessage(message, details);
    
    return this.createLog({
      user_id: userId,
      entity_type: 'page',
      entity_id: pageId,
      action: normalizedAction,
      message: cleanMessage,
      level: 'info',
      details,
      entity_ids: [pageId, projectId, userId] // Simple: page + project + user IDs
    });
  }

  /**
   * Log page operation with start/complete tracking
   */
  async logPageOperation(userId, pageId, projectId, operationType, status, details = {}) {
    // Use a consistent operation ID for start/complete pairs
    const operationId = `${pageId}_${operationType}`;
    
    if (status === 'started') {
      this.startOperation(operationId, operationType, { pageId, projectId, userId, ...details });
      return this.logPageActivity(
        userId, 
        pageId, 
        projectId, 
        `${operationType}_started`, 
        this.getOperationMessage(operationType, 'started'),
        { operationId, ...details }
      );
    } else if (status === 'completed') {
      const duration = this.endOperation(operationId);
      return this.logPageActivity(
        userId, 
        pageId, 
        projectId, 
        `${operationType}_completed`, 
        this.getOperationMessage(operationType, 'completed'),
        { operationId, duration_ms: duration, ...details }
      );
    } else {
      // Handle other statuses (failed, error, etc.)
      const duration = this.endOperation(operationId);
      return this.logPageActivity(
        userId, 
        pageId, 
        projectId, 
        `${operationType}_${status}`, 
        this.getOperationMessage(operationType, status),
        { operationId, duration_ms: duration, ...details }
      );
    }
  }

  /**
   * Normalize action names to AIVERIE style
   */
  normalizeAction(action) {
    // Convert technical action names to human-readable format
    const actionMap = {
      'page_created': 'page_created',
      'page_updated': 'page_updated',
      'page_status_undefined': 'page_status_updated',
      'page_processing_started': 'page_processing_started',
      'page_processing_completed': 'page_processing_completed',
      'page_processing_failed': 'page_processing_failed',
      'page_upload_started': 'page_upload_started',
      'page_upload_completed': 'page_upload_completed',
      'page_upload_failed': 'page_upload_failed',
      'summary_generation_started': 'summary_generation_started',
      'summary_generation_completed': 'summary_generation_completed',
      'summary_generation_failed': 'summary_generation_failed'
    };
    
    return actionMap[action] || action;
  }

  /**
   * Format message to be clean and human-readable
   */
  formatMessage(message, details = {}) {
    // Remove technical details and make messages cleaner
    if (message.includes('undefined → undefined')) {
      return 'Status updated';
    }
    
    // Clean up status update messages
    if (message.includes('Page status updated:')) {
      const statusMatch = message.match(/Page status updated: (.+) → (.+)/);
      if (statusMatch) {
        const [, oldStatus, newStatus] = statusMatch;
        if (oldStatus !== 'undefined' && newStatus !== 'undefined') {
          return `Status changed from ${oldStatus} to ${newStatus}`;
        }
      }
      return 'Status updated';
    }
    
    // Clean up creation messages
    if (message.includes('Page created:')) {
      return 'Page created';
    }
    
    return message;
  }

  /**
   * Get standardized operation messages
   */
  getOperationMessage(operationType, status) {
    const messages = {
      'page_processing': {
        'started': 'Page Processing Started',
        'completed': 'Page Processing Completed',
        'failed': 'Page Processing Failed'
      },
      'page_upload': {
        'started': 'Page Upload Started',
        'completed': 'Page Upload Completed',
        'failed': 'Page Upload Failed'
      },
      'summary_generation': {
        'started': 'Summary Generation Started',
        'completed': 'Summary Generation Completed',
        'failed': 'Summary Generation Failed'
      },
      'classification_analysis': {
        'started': 'Classification Analysis Started',
        'completed': 'Classification Analysis Completed',
        'failed': 'Classification Analysis Failed'
      },
      'condition_assessment': {
        'started': 'Condition Assessment Started',
        'completed': 'Condition Assessment Completed',
        'failed': 'Condition Assessment Failed'
      },
      'valuation': {
        'started': 'Valuation Started',
        'completed': 'Valuation Completed',
        'failed': 'Valuation Failed'
      },
      'repair_assessment': {
        'started': 'Repair Assessment Started',
        'completed': 'Repair Assessment Completed',
        'failed': 'Repair Assessment Failed'
      }
    };
    
    return messages[operationType]?.[status] || `${operationType} ${status}`;
  }
}
