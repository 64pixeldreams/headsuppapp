/**
 * Mock Slack adapter for testing
 * Simulates Slack API calls without making real requests
 */

export class MockSlackAdapter {
  constructor(logger) {
    this.logger = logger;
    this.sentMessages = [];
    this.failNext = false; // For testing error scenarios
  }

  /**
   * Mock send implementation
   */
  async send(params) {
    this.logger?.debug('Mock send Slack message', {
      channel: params.slackChannel,
      text: params.text
    });

    // Simulate failure if requested
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Mock Slack send failure');
    }

    // Store the message
    const message = {
      channel: params.slackChannel || 'webhook',
      text: params.text,
      attachments: params.attachments,
      blocks: params.blocks,
      timestamp: new Date().toISOString()
    };
    
    this.sentMessages.push(message);

    // Return mock success response
    return {
      success: true,
      messageId: `mock_slack_${Date.now()}`,
      channel: params.slackChannel || 'webhook'
    };
  }

  /**
   * Test helper: Get all sent messages
   */
  getSentMessages() {
    return this.sentMessages;
  }

  /**
   * Test helper: Clear sent messages
   */
  clearSentMessages() {
    this.sentMessages = [];
  }

  /**
   * Test helper: Make next send fail
   */
  simulateFailure() {
    this.failNext = true;
  }
}
