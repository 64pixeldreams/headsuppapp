/**
 * Slack Adapter
 * Notification adapter for the messaging module using Slack webhooks or API
 */

export class SlackAdapter {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
    this.webhookUrl = env.SLACK_WEBHOOK_URL;
    this.botToken = env.SLACK_BOT_TOKEN;
    this.defaultChannel = env.SLACK_DEFAULT_CHANNEL || '#general';
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Send a message to Slack
   * @param {object} params - Message parameters
   * @returns {Promise<{success: boolean, messageId?: string}>}
   */
  async send(params) {
    const timer = this.logger?.timer('slack.send');
    
    try {
      const { 
        slackChannel, 
        text, 
        attachments, 
        blocks,
        username,
        icon_emoji,
        icon_url 
      } = params;

      // Validate we have content to send
      if (!text && !attachments && !blocks) {
        throw new Error('Message must include text, attachments, or blocks');
      }

      let result;

      // Determine which method to use
      if (this.webhookUrl && !slackChannel) {
        // Use webhook for simple messages
        result = await this._sendWebhook({
          text,
          attachments,
          blocks,
          username,
          icon_emoji,
          icon_url
        });
      } else if (this.botToken) {
        // Use API for channel-specific messages
        result = await this._sendAPI({
          channel: slackChannel || this.defaultChannel,
          text,
          attachments,
          blocks,
          username,
          icon_emoji,
          icon_url
        });
      } else {
        throw new Error('No Slack configuration found. Set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN');
      }

      timer?.end({ success: true });
      return result;

    } catch (err) {
      this.logger?.error('Slack send error', err);
      timer?.end({ error: true });
      throw err;
    }
  }

  /**
   * Send via webhook (simpler, limited features)
   * @private
   */
  async _sendWebhook(payload, retryCount = 0) {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();

      if (response.ok && responseText === 'ok') {
        return {
          success: true,
          messageId: `webhook_${Date.now()}`
        };
      }

      const error = new Error(`Slack webhook error: ${responseText}`);
      error.status = response.status;
      throw error;

    } catch (err) {
      // Retry on network errors
      if (retryCount < this.maxRetries && this._shouldRetry(err)) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        this.logger?.debug(`Retrying Slack webhook after ${delay}ms (attempt ${retryCount + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._sendWebhook(payload, retryCount + 1);
      }

      throw err;
    }
  }

  /**
   * Send via Bot API (full features)
   * @private
   */
  async _sendAPI(payload, retryCount = 0) {
    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.ok) {
        return {
          success: true,
          messageId: data.ts, // Slack timestamp ID
          channel: data.channel
        };
      }

      // Handle Slack API errors
      const error = new Error(data.error || 'Unknown Slack API error');
      error.details = data;
      
      // Handle rate limiting
      if (data.error === 'rate_limited') {
        error.retryAfter = data.retry_after;
      }
      
      throw error;

    } catch (err) {
      // Retry on network errors or rate limiting
      if (retryCount < this.maxRetries && this._shouldRetry(err)) {
        const delay = err.retryAfter 
          ? err.retryAfter * 1000 
          : this.retryDelay * Math.pow(2, retryCount);
          
        this.logger?.debug(`Retrying Slack API after ${delay}ms (attempt ${retryCount + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._sendAPI(payload, retryCount + 1);
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

    // Retry on rate limiting
    if (err.message && err.message.includes('rate_limited')) {
      return true;
    }

    // Retry on server errors (5xx)
    if (err.status >= 500 && err.status < 600) {
      return true;
    }

    return false;
  }

  /**
   * Format a message for different contexts
   * @param {string} level - Message level (info, warning, error, success)
   * @param {string} title - Message title
   * @param {string|object} content - Message content
   * @returns {object} Formatted Slack message
   */
  static formatMessage(level, title, content) {
    const colors = {
      info: '#36a64f',
      warning: '#ff9f00',
      error: '#ff0000',
      success: '#36a64f'
    };

    const emojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨',
      success: '✅'
    };

    // Handle string content
    if (typeof content === 'string') {
      return {
        text: `${emojis[level]} ${title}`,
        attachments: [{
          color: colors[level],
          text: content,
          ts: Math.floor(Date.now() / 1000)
        }]
      };
    }

    // Handle object content (for structured data)
    const fields = Object.entries(content).map(([key, value]) => ({
      title: key,
      value: String(value),
      short: String(value).length < 40
    }));

    return {
      text: `${emojis[level]} ${title}`,
      attachments: [{
        color: colors[level],
        fields,
        ts: Math.floor(Date.now() / 1000)
      }]
    };
  }
}
