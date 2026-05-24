import { EnhancedDataModel } from '../modules/datamodel/enhanced-registration.js';

/**
 * WEBHOOK_QUEUE model
 *
 * Required by CFKit webhooks module for async processing and retry tracking.
 */
export const WebhookQueueModel = {
  name: 'WEBHOOK_QUEUE',

  fields: {
    queue_id: { type: 'string', primary: true, auto: true, prefix: 'wq' },
    user_id: { type: 'string', required: true },

    webhook_id: { type: 'string', required: true },
    event_type: { type: 'string', required: true },
    payload: { type: 'json', required: true },

    attempts: { type: 'number', default: 0 },
    max_attempts: { type: 'number', default: 3 },
    status: { type: 'string', default: 'pending', enum: ['pending', 'processing', 'completed', 'failed'] },
    next_retry: { type: 'string' },
    error_message: { type: 'string' }
  },

  kv: { namespace: 'CACHE', keyPattern: 'webhook_queue:{id}' },

  d1: {
    table: 'webhook_queue',
    syncFields: ['queue_id', 'user_id', 'webhook_id', 'event_type', 'status', 'attempts', 'created_at', 'updated_at']
  },

  options: { timestamps: true, softDelete: true, auth: true }
};

EnhancedDataModel.registerModel(WebhookQueueModel, { auth: true });

