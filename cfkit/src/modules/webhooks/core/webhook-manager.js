/**
 * Webhook Manager
 * Handles webhook delivery with retry logic
 */

export class WebhookManager {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger || null;
    this.maxRetries = 3;
    this.timeoutMs = 10000; // 10 seconds
  }

  /**
   * Send a webhook to a URL with payload
   * @param {string} url - Target webhook URL
   * @param {object} payload - Data to send
   * @param {object} options - Additional options
   * @returns {Promise<{success: boolean, response?: object, error?: object}>}
   */
  async send(url, payload, options = {}) {
    const timer = this.logger?.timer('webhook.send');
    const startTime = Date.now();
    
    try {
      // Validate URL
      if (!this._isValidUrl(url)) {
        throw new Error(`Invalid webhook URL: ${url}`);
      }

      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': `${this.env.APP_NAME || 'NimbusHQ'}/1.0`,
        ...options.headers
      };

      // Add webhook signature if secret provided
      if (options.secret) {
        const signature = await this._generateSignature(payload, options.secret);
        headers['X-Webhook-Signature'] = signature;
      }

      this.logger?.log('Sending webhook', {
        url,
        payloadSize: JSON.stringify(payload).length,
        hasSignature: !!options.secret
      });

      // Make the request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check if response is successful
      if (response.ok) {
        const responseData = await this._parseResponse(response);
        
        this.logger?.log('Webhook delivered successfully', {
          url,
          status: response.status,
          responseSize: responseData ? JSON.stringify(responseData).length : 0
        });

        const duration = Date.now() - startTime;
        timer?.end({ success: true, status: response.status });

        return {
          success: true,
          duration,
          response: {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData
          }
        };
      } else {
        // Non-2xx response
        const errorData = await this._parseResponse(response);
        const error = new Error(`Webhook failed with status ${response.status}`);
        error.status = response.status;
        error.response = errorData;
        
        throw error;
      }

    } catch (err) {
      this.logger?.error('Webhook delivery failed', {
        url,
        error: err.message,
        status: err.status || 'network_error'
      });

      const duration = Date.now() - startTime;
      timer?.end({ error: true, status: err.status || 'network_error' });

      return {
        success: false,
        duration,
        error: {
          type: err.name || 'WebhookError',
          message: err.message,
          status: err.status || null,
          response: err.response || null
        }
      };
    }
  }

  /**
   * Send webhook with automatic retry logic
   * @param {string} url - Target webhook URL
   * @param {object} payload - Data to send
   * @param {object} options - Additional options
   * @returns {Promise<{success: boolean, attempts: number, lastError?: object}>}
   */
  async sendWithRetry(url, payload, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger?.log(`Webhook attempt ${attempt}/${maxRetries}`, { url });

      const result = await this.send(url, payload, options);

      if (result.success) {
        this.logger?.log('Webhook delivered successfully', {
          url,
          attempts: attempt,
          totalAttempts: maxRetries
        });

        return {
          success: true,
          attempts: attempt,
          response: result.response
        };
      }

      lastError = result.error;

      // Don't retry on certain errors
      if (this._shouldNotRetry(result.error)) {
        this.logger?.log('Not retrying webhook due to error type', {
          url,
          errorType: result.error.type,
          status: result.error.status
        });
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        this.logger?.log(`Waiting ${delayMs}ms before retry`, { url, attempt });
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    this.logger?.error('Webhook failed after all retries', {
      url,
      attempts: maxRetries,
      lastError: lastError?.message
    });

    return {
      success: false,
      attempts: maxRetries,
      lastError
    };
  }

  /**
   * Validate webhook URL
   * @private
   */
  _isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  /**
   * Generate webhook signature for security
   * @private
   */
  async _generateSignature(payload, secret) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const key = encoder.encode(secret);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return `sha256=${hashHex}`;
  }

  /**
   * Parse response safely
   * @private
   */
  async _parseResponse(response) {
    try {
      const text = await response.text();
      if (!text) return null;
      
      // Try to parse as JSON
      try {
        return JSON.parse(text);
      } catch {
        // Return as text if not JSON
        return { text };
      }
    } catch {
      return null;
    }
  }

  /**
   * Determine if we should retry based on error
   * @private
   */
  _shouldNotRetry(error) {
    // Don't retry on client errors (4xx) except rate limiting
    if (error.status >= 400 && error.status < 500) {
      return error.status !== 429; // Retry on rate limiting
    }
    
    // Don't retry on invalid URLs or signature errors
    if (error.type === 'TypeError' && error.message.includes('Invalid')) {
      return true;
    }
    
    // Retry on server errors (5xx) and network errors
    return false;
  }
}
