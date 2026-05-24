/**
 * Webhook Trigger
 * Handles async webhook firing with caching and conditional execution
 * Uses existing DataModel and logging framework patterns
 */

import { DataModel } from '../../datamodel/index.js';
import { WebhookConfigModel } from '../../../models/webhook-config.js';
import { WebhookQueueModel } from '../../../models/webhook-queue.js';
import { WebhookManager } from './webhook-manager.js';
import { AuditLogger } from '../../logs/core/audit-logger.js';

export class WebhookTrigger {
  constructor(datastore, logger) {
    this.datastore = datastore;
    this.logger = logger;
    
    // Initialize webhook manager
    this.webhookManager = new WebhookManager(datastore.env, logger);
    
    // Initialize audit logger for webhook tracking
    this.auditLogger = new AuditLogger(datastore, logger);
    
    // Cache for webhook configs (5 minute TTL)
    this.configCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Register models (following AuditLogger pattern)
    DataModel.registerModel(WebhookConfigModel);
    DataModel.registerModel(WebhookQueueModel);
  }

  /**
   * Fire webhooks for a specific event (async, non-blocking)
   * @param {string} eventType - Event type (e.g., 'page.completed', 'project.created')
   * @param {object} eventData - Event data to send
   * @param {object} context - Request context (for waitUntil)
   * @param {boolean} async - Whether to fire asynchronously (default: true)
   */
  static async fireWebhooks(eventType, eventData, context, async = true) {
    if (async) {
      // Non-blocking: Fire and continue (using context.waitUntil)
      if (context && context.waitUntil) {
        context.waitUntil(this._processWebhooks(eventType, eventData, context));
      } else {
        // Fallback: Fire in background without blocking
        this._processWebhooks(eventType, eventData, context).catch(error => {
          console.error('Background webhook processing failed:', error);
        });
      }
    } else {
      // Blocking: Wait for webhooks to complete
      await this._processWebhooks(eventType, eventData, context);
    }
  }

  /**
   * Process webhooks for an event (internal method)
   * @param {string} eventType - Event type
   * @param {object} eventData - Event data
   * @param {object} context - Request context
   * @private
   */
  static async _processWebhooks(eventType, eventData, context) {
    try {
      // Create instance for processing
      const trigger = new WebhookTrigger(context.datastore, context.logger);
      
      // Get webhook configs for this event
      const webhooks = await trigger.getWebhooksForEvent(eventType, eventData.user_id);
      
      if (webhooks.length === 0) {
        trigger.logger?.log('No webhooks configured for event', { 
          eventType, 
          userId: eventData.user_id 
        });
        return;
      }

      trigger.logger?.log('Processing webhooks for event', {
        eventType,
        userId: eventData.user_id,
        webhookCount: webhooks.length
      });

      // Process each webhook with Option B: single result log
      for (const webhook of webhooks) {
        trigger.logger?.log('🔧 WEBHOOK: Starting webhook delivery', {
          webhookId: webhook.webhook_id,
          webhookName: webhook.name,
          eventType,
          targetUrl: webhook.target_url
        });
        
        // Process webhook and log final result (synchronous)
        await trigger._processWebhookWithResultLogging(webhook, eventType, eventData);
      }

    } catch (error) {
      context.logger?.error('Webhook processing failed', {
        eventType,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Get webhook configurations for a specific event
   * @param {string} eventType - Event type to match
   * @param {string} userId - User ID for filtering
   * @returns {Promise<Array>} Array of webhook configs
   */
  async getWebhooksForEvent(eventType, userId) {
    const cacheKey = `${userId}:${eventType}`;
    
    // Check cache first
    const cached = this.configCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      this.logger?.log('Using cached webhook configs', { 
        eventType, 
        userId, 
        count: cached.webhooks.length 
      });
      return cached.webhooks;
    }

    try {
      // Query D1 for webhook configs (simplified for debugging)
      const query = `
        SELECT * FROM webhook_configs 
        WHERE user_id = ? 
        AND status = 'active'
        ORDER BY created_at ASC
      `;
      
      const result = await this.datastore.D1.execute(query, [userId]);
      const webhooks = result.results || [];

      // Cache the results
      this.configCache.set(cacheKey, {
        webhooks,
        timestamp: Date.now()
      });

      this.logger?.log('Loaded webhook configs from D1', {
        eventType,
        userId,
        count: webhooks.length
      });

      return webhooks;

    } catch (error) {
      this.logger?.error('Failed to load webhook configs', {
        eventType,
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Process webhook with result logging (Option B implementation)
   * @param {object} webhook - Webhook configuration
   * @param {string} eventType - Event type
   * @param {object} eventData - Event data
   * @private
   */
  async _processWebhookWithResultLogging(webhook, eventType, eventData) {
    const userId = eventData.user_id || 'system';
    
    try {
      // Build webhook payload
      const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data: eventData,
        webhook: {
          id: webhook.webhook_id,
          name: webhook.name
        }
      };

      // Fire webhook (synchronous in main context)
      const result = await this.webhookManager.send(
        webhook.target_url,
        payload,
        {
          secret: webhook.secret,
          timeout: webhook.timeout_ms || 10000
        }
      );

      // Determine action type based on result
      let action, message, shouldRetry = false;
      
      if (result.success) {
        action = 'webhook_delivered';
        message = `Webhook delivered successfully to ${webhook.name}`;
      } else {
        // Classify failure type
        const status = result.error?.status;
        if (status >= 400 && status < 500 && status !== 429) {
          // Client error (4xx) - permanent failure, don't retry
          action = 'webhook_hard_fail';
          message = `Webhook permanently failed to ${webhook.name}: ${result.error?.message}`;
        } else {
          // Server error (5xx), network error, or rate limiting (429) - temporary failure
          action = 'webhook_failed';
          message = `Webhook failed to ${webhook.name}: ${result.error?.message}`;
          shouldRetry = true;
        }
      }

      // Build rich metadata
      const metadata = {
        webhook_id: webhook.webhook_id,
        webhook_name: webhook.name,
        event_type: eventType,
        target_url: webhook.target_url,
        response_time_ms: result.duration,
        payload_size: JSON.stringify(payload).length,
        entity_type: eventType.split('.')[0],
        entity_id: eventData.page_id || eventData.project_id || eventData.entity_id
      };

      if (result.success) {
        // Success metadata
        metadata.response_status = result.response?.status;
        metadata.response_size = result.response?.data ? JSON.stringify(result.response.data).length : 0;
      } else {
        // Failure metadata
        metadata.response_status = result.error?.status || null;
        metadata.error_message = result.error?.message;
        metadata.error_type = result.error?.type;
        metadata.retry_queued = shouldRetry;
        metadata.permanent_failure = !shouldRetry;
      }

      // Log final result with complete metadata (synchronous)
      await this.auditLogger.logWebhookActivity(
        userId,
        webhook.webhook_id,
        action,
        message,
        metadata
      );

      // Update webhook stats
      await this._updateWebhookStats(webhook.webhook_id, result.success);

      // Queue for retry if needed
      if (shouldRetry) {
        await this._queueWebhookRetry(webhook, eventType, eventData, result.error);
      }

      this.logger?.log('🔧 WEBHOOK: Result logged', {
        action,
        success: result.success,
        duration: result.duration,
        shouldRetry
      });

    } catch (error) {
      // Unexpected processing error
      await this.auditLogger.logWebhookActivity(
        userId,
        webhook.webhook_id,
        'webhook_failed',
        `Webhook processing error for ${webhook.name}: ${error.message}`,
        {
          webhook_id: webhook.webhook_id,
          webhook_name: webhook.name,
          event_type: eventType,
          target_url: webhook.target_url,
          error_message: error.message,
          error_type: 'ProcessingError',
          retry_queued: true,
          entity_type: eventType.split('.')[0],
          entity_id: eventData.page_id || eventData.project_id || eventData.entity_id
        }
      );

      // Queue for retry
      await this._queueWebhookRetry(webhook, eventType, eventData, {
        type: 'ProcessingError',
        message: error.message
      });

      this.logger?.error('🔧 WEBHOOK: Processing error', {
        webhookId: webhook.webhook_id,
        error: error.message
      });
    }
  }



  /**
   * Queue webhook for retry using WebhookQueue model
   * @param {object} webhook - Webhook configuration
   * @param {string} eventType - Event type
   * @param {object} eventData - Event data
   * @param {object} error - Error details
   * @private
   */
  async _queueWebhookRetry(webhook, eventType, eventData, error) {
    try {
      // Create webhook queue entry using DataModel
      const webhookQueue = new DataModel('WEBHOOK_QUEUE', this.datastore, this.logger);
      
      await webhookQueue.create({
        event_type: eventType,
        target_url: webhook.target_url,
        payload: {
          event: eventType,
          timestamp: new Date().toISOString(),
          data: eventData,
          webhook: {
            id: webhook.webhook_id,
            name: webhook.name
          }
        },
        headers: webhook.secret ? { 'X-Webhook-Secret': webhook.secret } : {},
        user_id: eventData.user_id,
        entity_id: eventData.page_id || eventData.project_id || eventData.entity_id,
        entity_type: eventType.split('.')[0], // 'page', 'project', etc.
        last_error: error.message || 'Unknown error',
        max_retries: webhook.max_retries || 3
      });

      // Update webhook failure count
      await this._updateWebhookStats(webhook.webhook_id, false);

    } catch (queueError) {
      this.logger?.error('Failed to queue webhook for retry', {
        webhookId: webhook.webhook_id,
        eventType,
        error: queueError.message
      });
    }
  }

  /**
   * Update webhook statistics (success/failure tracking)
   * @param {string} webhookId - Webhook ID
   * @param {boolean} success - Whether the webhook succeeded
   * @private
   */
  async _updateWebhookStats(webhookId, success) {
    try {
      const webhook = new DataModel('WEBHOOK_CONFIG', this.datastore, this.logger);
      const config = await webhook.get(webhookId);
      
      if (config) {
        const updates = success ? {
          failure_count: 0,
          last_success_at: new Date().toISOString(),
          status: 'active' // Reset status if it was failed
        } : {
          failure_count: (config.failure_count || 0) + 1,
          last_failure_at: new Date().toISOString()
        };

        // Auto-disable webhook after too many failures (circuit breaker)
        if (!success && updates.failure_count >= 10) {
          updates.status = 'failed';
          this.logger?.log('Webhook auto-disabled due to failures', {
            webhookId,
            failureCount: updates.failure_count
          });
        }

        await webhook.update(updates);

        // Clear cache for this webhook's user
        this._clearUserCache(config.user_id);
      }

    } catch (error) {
      this.logger?.error('Failed to update webhook stats', {
        webhookId,
        error: error.message
      });
    }
  }

  /**
   * Clear cached webhook configs for a user
   * @param {string} userId - User ID
   * @private
   */
  _clearUserCache(userId) {
    const keysToDelete = [];
    for (const [key] of this.configCache.entries()) {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.configCache.delete(key));
  }

  /**
   * Clear all cached webhook configs
   */
  clearCache() {
    this.configCache.clear();
    this.logger?.log('Webhook config cache cleared');
  }
}
