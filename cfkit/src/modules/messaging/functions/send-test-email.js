/**
 * Test Email CloudFunction
 * Sends a test email to verify MailerSend integration
 */

import { Messenger } from '../core/messenger.js';

/**
 * Send test email CloudFunction handler
 * @param {Object} requestContext - CloudFunction request context
 * @returns {Promise<Object>} Email sending result
 */
export async function sendTestEmail(requestContext) {
  const { env, logger, payload, auth } = requestContext;
  
  logger.log('Test email sending started', { 
    userId: auth?.user_id,
    authObject: auth,
    recipient: payload.to
  });
  
  try {
    // Initialize messenger
    const messenger = new Messenger(env, logger);
    
    // Get user email from payload or auth
    const recipientEmail = payload.to || auth?.user?.email;
    if (!recipientEmail) {
      throw new Error('Recipient email is required');
    }
    
    // Send test email using template
    const result = await messenger.sendTemplate('notification', recipientEmail, {
      title: 'Test Email',
      message: 'This is a test email to verify that MailerSend integration is working correctly!',
      userName: auth?.user?.name || 'User',
      details: 'Email system is configured and ready to send notifications.',
      actionUrl: `${env.APP_URL}/app/dashboard.html`,
      actionText: 'Go to Dashboard',
      icon: '✅',
      headerColor: '#10B981',
      notificationColor: '#10B981',
      notificationBg: '#ECFDF5'
    });
    
    logger.log('Test email sent successfully', { 
      success: result.success,
      messageId: result.messageId,
      recipient: recipientEmail
    });
    
    return {
      success: true,
      data: {
        messageId: result.messageId,
        recipient: recipientEmail,
        message: 'Test email sent successfully!'
      }
    };
    
  } catch (error) {
    logger.error('Test email sending failed', error);
    throw error;
  }
}

/**
 * CloudFunction configuration
 */
export const sendTestEmailConfig = {
  auth: true,
  rateLimit: {
    requests: 5,
    window: 300 // 5 emails per 5 minutes
  }
};
