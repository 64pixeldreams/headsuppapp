import { EnhancedDataModel } from '../modules/datamodel/enhanced-registration.js';

/**
 * LOG model
 *
 * Required by CFKit logs module (`src/modules/logs/core/audit-logger.js`).
 * Stores structured audit logs in KV (CACHE) + D1 (logs table).
 */
export const LogModel = {
  name: 'LOG',

  fields: {
    log_id: { type: 'string', primary: true, auto: true, prefix: 'log' },
    user_id: { type: 'string' },

    level: { type: 'string', required: true, enum: ['debug', 'info', 'warn', 'error'] },
    message: { type: 'string', required: true },

    entity_type: { type: 'string' },
    entity_id: { type: 'string' },
    entity_ids: { type: 'array', default: [] },

    action: { type: 'string' },
    details: { type: 'json' },

    request_id: { type: 'string' },
    duration_ms: { type: 'number' }
  },

  kv: { namespace: 'CACHE', keyPattern: 'log:{id}' },

  d1: {
    table: 'logs',
    syncFields: [
      'log_id',
      'user_id',
      'level',
      'message',
      'entity_type',
      'entity_id',
      'entity_ids',
      'action',
      'details',
      'request_id',
      'duration_ms',
      'created_at',
      'updated_at'
    ]
  },

  options: { timestamps: true, softDelete: true, auth: true }
};

// Register for optional auto-functions; safe even if unused.
EnhancedDataModel.registerModel(LogModel, { auth: true });

