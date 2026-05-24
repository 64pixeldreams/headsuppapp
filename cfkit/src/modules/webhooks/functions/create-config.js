/**
 * Webhook Config Create CloudFunction
 * Creates a new webhook configuration for a user
 */

import { DataModel } from '../../datamodel/core/datamodel.js';

/**
 * Create webhook config CloudFunction handler
 * @param {Object} requestContext - CloudFunction request context
 * @returns {Promise<Object>} Webhook config creation result
 */
export async function webhookConfigCreate(requestContext) {
  const { env, logger, payload, auth } = requestContext;
  
  logger.log('Webhook config creation started', { 
    userId: auth.user_id,
    name: payload.name
  });
  
  try {
    // Use the exact same pattern as notification creation
    const { Datastore } = await import('../../datastore/index.js');
    const { WebhookConfigModel } = await import('../../../models/webhook-config.js');
    
    const datastore = new Datastore(env, logger);
    
    // Generate webhook ID
    const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Register and create DataModel instance (same as notification pattern)
    DataModel.registerModel(WebhookConfigModel);
    const webhookConfig = new DataModel('WEBHOOK_CONFIG', datastore, logger);
    
    // Set webhook config data (same pattern as notifications)
    webhookConfig.set('webhook_id', webhookId);
    webhookConfig.set('user_id', auth.user_id);
    webhookConfig.set('name', payload.name);
    webhookConfig.set('target_url', payload.target_url);
    webhookConfig.set('event_types', payload.event_types || []);
    webhookConfig.set('status', payload.status || 'active');
    webhookConfig.set('timeout_ms', payload.timeout_ms || 10000);
    webhookConfig.set('max_retries', payload.max_retries || 3);
    webhookConfig.set('secret', payload.secret || null);
    webhookConfig.set('project_id', payload.project_id || null);
    webhookConfig.set('metadata', payload.metadata || {});
    webhookConfig.set('failure_count', 0);
    webhookConfig.set('created_at', new Date().toISOString());
    
    // Save the webhook config
    await webhookConfig.save();
    
    logger.log('Webhook config created successfully', { 
      webhookId: webhookConfig.data.webhook_id,
      name: payload.name,
      targetUrl: payload.target_url,
      eventTypes: payload.event_types
    });
    
    return {
      success: true,
      webhook_id: webhookConfig.data.webhook_id,
      data: webhookConfig.data
    };
    
  } catch (error) {
    logger.error('Webhook config creation failed', error);
    throw error;
  }
}

/**
 * CloudFunction configuration
 */
export const webhookConfigCreateConfig = {
  auth: true,
  validation: {
    name: { type: 'string', required: true },
    target_url: { type: 'string', required: true }
  }
};
