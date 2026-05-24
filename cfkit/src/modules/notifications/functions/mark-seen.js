/**
 * Notification Mark Seen CloudFunction
 * Marks a notification as seen by the user
 */

import { DataModel } from '../../datamodel/core/datamodel.js';

/**
 * Mark notification as seen CloudFunction handler
 * @param {Object} requestContext - CloudFunction request context
 * @returns {Promise<Object>} Mark seen result
 */
export async function notificationMarkSeen(requestContext) {
  const { env, logger, payload, auth } = requestContext;
  
  logger.log('Notification mark seen started', { 
    userId: auth.user_id,
    notificationId: payload.notification_id
  });
  
  try {
    // Use the same pattern as logs - update via Datastore
    const { Datastore } = await import('../../datastore/index.js');
    const datastore = new Datastore(env, logger);
    
    // Update notification in D1 (same pattern as logs)
    const sql = `
      UPDATE notifications 
      SET seen = true, updated_at = ?
      WHERE notification_id = ? AND user_id = ?
    `;
    
    const result = await datastore.query(sql, [
      new Date().toISOString(),
      payload.notification_id,
      auth.user_id
    ]);
    
    if (result.changes === 0) {
      return {
        success: false,
        error: 'Notification not found or access denied'
      };
    }
    
    logger.log('Notification marked as seen', { 
      notificationId: payload.notification_id,
      userId: auth.user_id
    });
    
    return {
      success: true,
      notification_id: payload.notification_id,
      seen: true
    };
    
  } catch (error) {
    logger.error('Notification mark seen failed', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * CloudFunction configuration
 */
export const notificationMarkSeenConfig = {
  auth: true,
  validation: {
    notification_id: { type: 'string', required: true }
  }
};
