/**
 * Mock MailerSend adapter for testing
 * Simulates API calls without making real requests
 */

export class MockMailerSendAdapter {
  constructor(logger) {
    this.logger = logger;
    this.sentEmails = [];
    this.failNext = false; // For testing error scenarios
  }

  /**
   * Mock send implementation
   */
  async send(params) {
    this.logger?.debug('Mock send email', {
      to: params.to.email,
      subject: params.subject
    });

    // Simulate failure if requested
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Mock send failure');
    }

    // Store the email
    const email = {
      to: params.to,
      from: params.from,
      subject: params.subject,
      html: params.html,
      text: params.text,
      timestamp: new Date().toISOString()
    };
    
    this.sentEmails.push(email);

    // Return mock success response
    return {
      success: true,
      messageId: `mock_${Date.now()}`
    };
  }

  /**
   * Mock API key validation
   */
  async validateApiKey() {
    return true;
  }

  /**
   * Test helper: Get all sent emails
   */
  getSentEmails() {
    return this.sentEmails;
  }

  /**
   * Test helper: Clear sent emails
   */
  clearSentEmails() {
    this.sentEmails = [];
  }

  /**
   * Test helper: Make next send fail
   */
  simulateFailure() {
    this.failNext = true;
  }
}
