/**
 * Notification Create CloudFunction
 * Creates a new notification for a user
 */

import { DataModel } from '../../datamodel/core/datamodel.js';

/**
 * Create notification CloudFunction handler
 * @param {Object} requestContext - CloudFunction request context
 * @returns {Promise<Object>} Notification creation result
 */
export async function notificationCreate(requestContext) {
  const { env, logger, payload, auth } = requestContext;
  
  logger.log('Notification creation started', { 
    userId: auth.user_id,
    type: payload.type
  });
  
  try {
    // Use the exact same pattern as AuditLogger - create via DataModel
    const { Datastore } = await import('../../datastore/index.js');
    const { DataModel } = await import('../../datamodel/index.js');
    const { NotificationModel } = await import('../../../models/notification.js');
    
    const datastore = new Datastore(env, logger);
    
    // Generate notification ID
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Register and create DataModel instance (same as AuditLogger)
    DataModel.registerModel(NotificationModel);
    const notification = new DataModel('NOTIFICATION', datastore, logger);
    
    // Set notification data (same pattern as logs)
    notification.set('notification_id', notificationId);
    notification.set('user_id', payload.user_id || auth.user_id);
    notification.set('project_id', payload.project_id);
    notification.set('type', payload.type);
    notification.set('title', payload.title);
    notification.set('message', payload.message);
    notification.set('action_url', payload.action_url);
    notification.set('priority', payload.priority || 'normal');
    notification.set('metadata', payload.metadata || {});
    notification.set('seen', false);
    notification.set('dismissed', false);
    notification.set('created_at', new Date().toISOString());
    
    // Set expiry if provided
    if (payload.expires_in_hours) {
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + payload.expires_in_hours);
      notification.set('expires_at', expiryDate.toISOString());
    }
    
    // Save to both KV and D1 (same as logs)
    await notification.save();
    
    logger.log('Notification created successfully', { 
      notificationId,
      userId: notification.get('user_id'),
      type: notification.get('type')
    });
    
    return {
      success: true,
      notification: notification.toJSON(),
      notification_id: notificationId
    };
    
  } catch (error) {
    logger.error('Notification creation failed', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * CloudFunction configuration
 */
export const notificationCreateConfig = {
  auth: true,
  validation: {
    type: { type: 'string', required: true },
    title: { type: 'string', required: true },
    message: { type: 'string', required: true },
    user_id: { type: 'string', required: false }, // Optional - defaults to auth.user_id
    project_id: { type: 'string', required: false },
    action_url: { type: 'string', required: false },
    priority: { type: 'string', required: false },
    metadata: { type: 'object', required: false },
    expires_in_hours: { type: 'number', required: false }
  }
};
