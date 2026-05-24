/**
 * MailerSend Adapter
 * Email adapter for the messaging module using MailerSend API
 */

export class MailerSendAdapter {
  constructor(apiKey, logger) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.baseUrl = 'https://api.mailersend.com/v1';
    this.maxRetries = 3;
    this.retryDelay = 1000; // Base delay for exponential backoff
  }

  /**
   * Send an email via MailerSend API
   * @param {object} params - Email parameters
   * @returns {Promise<{success: boolean, messageId: string}>}
   */
  async send(params) {
    const timer = this.logger?.timer('mailersend.send');
    
    try {
      // Format the request body for MailerSend
      const body = {
        to: [{
          email: params.to.email,
          name: params.to.name || undefined
        }],
        from: {
          email: params.from.email,
          name: params.from.name || undefined
        },
        subject: params.subject,
        html: params.html,
        text: params.text || undefined
      };

      // Add reply-to if specified
      if (params.replyTo) {
        body.reply_to = {
          email: params.replyTo
        };
      }

      this.logger?.debug('Sending to MailerSend API', {
        to: params.to.email,
        subject: params.subject
      });

      // Make the API request with retry logic
      const response = await this._makeRequest('/email', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      timer?.end({ success: true });

      return {
        success: true,
        messageId: response.headers.get('x-message-id') || `ms_${Date.now()}`
      };

    } catch (err) {
      this.logger?.error('MailerSend API error', err);
      timer?.end({ error: true });
      throw err;
    }
  }

  /**
   * Validate the API key by making a test request
   * @returns {Promise<boolean>}
   */
  async validateApiKey() {
    try {
      // Use the activity endpoint as a simple test
      await this._makeRequest('/activity', {
        method: 'GET'
      });
      return true;
    } catch (err) {
      this.logger?.error('API key validation failed', err);
      return false;
    }
  }

  /**
   * Make an HTTP request to MailerSend API with retry logic
   * @private
   */
  async _makeRequest(endpoint, options = {}, retryCount = 0) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after') || 60;
        throw new Error(`Rate limited. Retry after ${retryAfter} seconds`);
      }

      // Handle success
      if (response.ok) {
        // Some endpoints return no content
        if (response.status === 204) {
          return { headers: response.headers };
        }
        
        const data = await response.json();
        return { 
          data, 
          headers: response.headers 
        };
      }

      // Handle errors
      const error = await response.json().catch(() => ({}));
      const errorMessage = error.message || `MailerSend API error: ${response.status}`;
      
      const err = new Error(errorMessage);
      err.status = response.status;
      err.details = error;
      throw err;

    } catch (err) {
      // Retry on network errors or 5xx errors
      if (retryCount < this.maxRetries && this._shouldRetry(err)) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        this.logger?.debug(`Retrying after ${delay}ms (attempt ${retryCount + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._makeRequest(endpoint, options, retryCount + 1);
      }

      throw err;
    }
  }

  /**
   * Determine if a request should be retried
   * @private
   */
  _shouldRetry(err) {
    // Retry on network errors
    if (err.name === 'TypeError' || err.name === 'FetchError') {
      return true;
    }

    // Retry on server errors (5xx)
    if (err.status >= 500 && err.status < 600) {
      return true;
    }

    // Don't retry on client errors (4xx) except rate limiting
    return false;
  }
}
