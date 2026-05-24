/**
 * Notification List CloudFunction
 * Lists notifications for the authenticated user
 */

import { DataModel } from '../../datamodel/core/datamodel.js';

/**
 * List notifications CloudFunction handler
 * @param {Object} requestContext - CloudFunction request context
 * @returns {Promise<Object>} Notification listing result
 */
export async function notificationList(requestContext) {
  const { env, logger, payload, auth } = requestContext;
  
  logger.log('Notification listing started', { 
    userId: auth.user_id,
    limit: payload.limit || 10
  });
  
  try {
    // Use the same pattern as logs - query via Datastore
    const { Datastore } = await import('../../datastore/index.js');
    const datastore = new Datastore(env, logger);
    
    // Query D1 for notifications (D1 table now exists!)
    const sql = `
      SELECT * FROM notifications 
      WHERE user_id = ? AND dismissed = false
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    
    const result = await datastore.D1.execute(sql, [auth.user_id, payload.limit || 10]);
    const notifications = result.results || [];
    
    // Filter out expired notifications
    const now = new Date().toISOString();
    const activeNotifications = notifications.filter(notification => {
      if (!notification.expires_at) return true; // No expiry
      return notification.expires_at > now; // Not expired
    });
    
    logger.log('Notification listing completed', { 
      totalFound: notifications.length,
      activeCount: activeNotifications.length
    });
    
    return {
      success: true,
      notifications: activeNotifications,
      count: activeNotifications.length
    };
    
  } catch (error) {
    logger.error('Notification listing failed', error);
    return {
      success: false,
      error: error.message,
      notifications: []
    };
  }
}

/**
 * CloudFunction configuration
 */
export const notificationListConfig = {
  auth: true,
  validation: {
    limit: { type: 'number', required: false, default: 10 },
    include_seen: { type: 'boolean', required: false, default: false }
  }
};
