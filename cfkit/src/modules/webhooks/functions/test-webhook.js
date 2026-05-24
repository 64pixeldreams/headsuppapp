/**
 * Test Webhook CloudFunction
 * Tests webhook delivery functionality
 */

import { WebhookManager } from '../core/webhook-manager.js';

/**
 * Test webhook CloudFunction handler
 * @param {Object} requestContext - CloudFunction request context
 * @returns {Promise<Object>} Webhook test result
 */
export async function testWebhook(requestContext) {
  const { env, logger, payload, auth } = requestContext;
  
  logger.log('Webhook test started', { 
    userId: auth?.user_id,
    targetUrl: payload.url
  });
  
  try {
    // Validate required fields
    if (!payload.url) {
      throw new Error('Webhook URL is required');
    }

    // Initialize webhook manager
    const webhookManager = new WebhookManager(env, logger);
    
    // Prepare test payload
    const testPayload = {
      event: 'test.webhook',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from NimbusHQ',
        test_id: `test_${Date.now()}`,
        user_id: auth?.user_id,
        ...payload.data // Allow custom test data
      }
    };

    // Send webhook with retry
    const result = await webhookManager.sendWithRetry(
      payload.url,
      testPayload,
      {
        maxRetries: payload.maxRetries || 3,
        secret: payload.secret, // Optional webhook signature
        headers: payload.headers || {}
      }
    );
    
    logger.log('Webhook test completed', { 
      success: result.success,
      attempts: result.attempts,
      url: payload.url
    });
    
    return {
      success: true,
      data: {
        webhook_result: result,
        test_payload: testPayload,
        target_url: payload.url,
        message: result.success 
          ? `Webhook delivered successfully in ${result.attempts} attempt(s)`
          : `Webhook failed after ${result.attempts} attempt(s): ${result.lastError?.message}`
      }
    };
    
  } catch (error) {
    logger.error('Webhook test failed', error);
    throw error;
  }
}

/**
 * CloudFunction configuration
 */
export const testWebhookConfig = {
  auth: true,
  rateLimit: {
    requests: 10,
    window: 60 // 10 tests per minute
  }
};
