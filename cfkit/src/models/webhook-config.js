import { EnhancedDataModel } from '../modules/datamodel/enhanced-registration.js';

/**
 * WEBHOOK_CONFIG model
 *
 * Required by CFKit webhooks module (`src/modules/webhooks/core/webhook-trigger.js`).
 * NOTE: webhooks module queries D1 table `webhook_configs` directly.
 */
export const WebhookConfigModel = {
  name: 'WEBHOOK_CONFIG',

  fields: {
    webhook_id: { type: 'string', primary: true, auto: true, prefix: 'wh' },
    user_id: { type: 'string', required: true },

    name: { type: 'string', required: true },
    target_url: { type: 'string', required: true },
    events: { type: 'array', default: [] },

    secret: { type: 'string' },
    status: { type: 'string', default: 'active', enum: ['active', 'disabled'] }
  },

  kv: { namespace: 'CACHE', keyPattern: 'webhook_config:{id}' },

  d1: {
    table: 'webhook_configs',
    syncFields: ['webhook_id', 'user_id', 'name', 'target_url', 'status', 'created_at', 'updated_at']
  },

  options: { timestamps: true, softDelete: true, auth: true }
};

EnhancedDataModel.registerModel(WebhookConfigModel, { auth: true });

