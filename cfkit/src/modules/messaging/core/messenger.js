/**
 * Main Messenger class for multi-channel messaging
 * Supports email via MailerSend and notifications via Slack
 */

import { MailerSendAdapter } from '../adapters/mailersend.js';
import { SlackAdapter } from '../adapters/slack.js';
import { loadTemplate } from '../templates/index.js';
import { validateEmail, formatEmail, validateChannel } from '../utils/validator.js';
import { mergeTemplateData } from '../utils/formatter.js';

export class Messenger {
  constructor(env, logger, mockAdapters = null) {
    this.env = env;
    this.logger = logger?.init('MESSAGING') || null;
    this.adapters = mockAdapters || {};
    
    if (!mockAdapters) {
      this._initAdapters();
    }
  }

  /**
   * Initialize messaging adapters
   * @private
   */
  _initAdapters() {
    const timer = this.logger?.timer('init');
    
    try {
      // Initialize MailerSend if configured
      if (this.env.MAILERSEND_API_KEY) {
        this.adapters.email = new MailerSendAdapter(
          this.env.MAILERSEND_API_KEY,
          this.logger
        );
        this.logger?.debug('MailerSend adapter initialized');
      }

      // Initialize Slack if configured
      if (this.env.SLACK_WEBHOOK_URL || this.env.SLACK_BOT_TOKEN) {
        this.adapters.slack = new SlackAdapter(this.env, this.logger);
        this.logger?.debug('Slack adapter initialized');
      }

      if (Object.keys(this.adapters).length === 0) {
        throw new Error('No messaging adapters configured. Set MAILERSEND_API_KEY or SLACK_WEBHOOK_URL/SLACK_BOT_TOKEN');
      }

      timer?.end({ success: true, adapters: Object.keys(this.adapters) });
    } catch (err) {
      this.logger?.error('Failed to initialize messaging adapters', err);
      timer?.end({ error: true });
      throw err;
    }
  }

  /**
   * Send a message via specified channel(s)
   * @param {object} params - Message parameters including channel
   * @returns {Promise<object>} Results by channel
   */
  async send(params) {
    const timer = this.logger?.timer('send');
    
    try {
      const { channel = 'email', ...messageParams } = params;
      
      // Support multiple channels
      const channels = Array.isArray(channel) ? channel : [channel];
      const results = {};

      // Validate channels
      for (const ch of channels) {
        if (!validateChannel(ch)) {
          results[ch] = {
            success: false,
            error: {
              type: 'ValidationError',
              message: `Invalid channel: ${ch}`
            }
          };
          continue;
        }

        if (!this.adapters[ch]) {
          results[ch] = {
            success: false,
            error: {
              type: 'ConfigurationError',
              message: `${ch} adapter not configured`
            }
          };
          continue;
        }

        try {
          // Channel-specific validation
          if (ch === 'email') {
            this._validateEmailParams(messageParams);
          }

          this.logger?.debug(`Sending via ${ch}`, { channel: ch });
          
          // Send via adapter
          const result = await this.adapters[ch].send(messageParams);
          results[ch] = result;
          
          this.logger?.info(`Message sent via ${ch}`, {
            channel: ch,
            messageId: result.messageId
          });

        } catch (err) {
          this.logger?.error(`Failed to send via ${ch}`, err);
          results[ch] = {
            success: false,
            error: {
              type: err.name || 'MessagingError',
              message: err.message,
              details: err.details || {}
            }
          };
        }
      }

      timer?.end({ channels: channels.length });
      
      // Return single result if one channel, otherwise return all results
      return channels.length === 1 ? results[channels[0]] : results;

    } catch (err) {
      this.logger?.error('Failed to send message', err);
      timer?.end({ error: true });
      
      return {
        success: false,
        error: {
          type: err.name || 'MessagingError',
          message: err.message,
          details: err.details || {}
        }
      };
    }
  }

  /**
   * Validate email parameters
   * @private
   */
  _validateEmailParams(params) {
    const { to, from, subject, html } = params;
    
    // Handle both string and object formats for email addresses
    const toEmail = typeof to === 'string' ? to : to?.email;
    const fromEmail = typeof from === 'string' ? from : from?.email;
    
    if (!validateEmail(toEmail)) {
      throw new Error(`Invalid recipient email: ${toEmail}`);
    }
    
    if (!validateEmail(fromEmail)) {
      throw new Error(`Invalid sender email: ${fromEmail}`);
    }

    if (!subject || !subject.trim()) {
      throw new Error('Subject is required for email');
    }

    if (!html || !html.trim()) {
      throw new Error('HTML content is required for email');
    }
  }

  /**
   * Send a raw email (convenience method)
   * @param {string} to - Recipient email
   * @param {string} from - Sender email
   * @param {string} subject - Email subject
   * @param {string} html - HTML content
   * @param {string} [text] - Plain text content
   * @returns {Promise<{success: boolean, messageId?: string, error?: object}>}
   */
  async sendEmail(to, from, subject, html, text = null) {
    // Format emails
    const formattedTo = formatEmail(to);
    const formattedFrom = formatEmail(from, this.env.DEFAULT_FROM_NAME);

    return this.send({
      channel: 'email',
      to: formattedTo,
      from: formattedFrom,
      subject,
      html,
      text
    });
  }

  /**
   * Send a Slack notification (convenience method)
   * @param {string} channel - Slack channel
   * @param {string} text - Message text
   * @param {array} [attachments] - Message attachments
   * @param {array} [blocks] - Message blocks
   * @returns {Promise<{success: boolean, messageId?: string, error?: object}>}
   */
  async sendSlack(channel, text, attachments = null, blocks = null) {
    return this.send({
      channel: 'slack',
      slackChannel: channel,
      text,
      attachments,
      blocks
    });
  }

  /**
   * Send an email using a template
   * @param {string} templateName - Name of the template
   * @param {string|object} to - Recipient email or full params with channel
   * @param {object} data - Template data
   * @param {object} [options] - Additional options
   * @returns {Promise<{success: boolean, messageId?: string, error?: object}>}
   */
  async sendTemplate(templateName, to, data = {}, options = {}) {
    const timer = this.logger?.timer('sendTemplate');
    
    try {
      // Load template
      const template = loadTemplate(templateName);
      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      this.logger?.debug('Loaded template', { templateName });

      // Handle Slack templates differently
      if (template.channel === 'slack') {
        const slackMessage = template.build(data);
        return await this.send({
          channel: 'slack',
          slackChannel: options.slackChannel || data.slackChannel,
          ...slackMessage
        });
      }

      // Handle email templates
      const mergedData = mergeTemplateData(template, data, this.env);

      // Extract email details
      const from = options.from || mergedData.from.email || this.env.DEFAULT_FROM_EMAIL;
      const subject = mergedData.subject;
      const html = mergedData.html;
      const text = mergedData.text;

      // Add reply-to if specified
      if (options.replyTo) {
        // This will be handled by the MailerSend adapter
        mergedData.replyTo = options.replyTo;
      }

      timer?.end({ template: templateName });

      // Handle different parameter formats
      if (typeof to === 'string') {
        // Legacy email-only format
        return await this.sendEmail(to, from, subject, html, text);
      } else {
        // New multi-channel format
        return await this.send({
          ...to,  // Contains channel and other params
          subject: mergedData.subject || subject,
          html: mergedData.html || html,
          text: mergedData.text || text,
          from: from
        });
      }

    } catch (err) {
      this.logger?.error('Failed to send template email', err);
      timer?.end({ error: true });
      
      return {
        success: false,
        error: {
          type: 'TemplateError',
          message: err.message,
          details: {
            template: templateName
          }
        }
      };
    }
  }

  /**
   * Validate the MailerSend API key
   * @returns {Promise<boolean>}
   */
  async validateApiKey() {
    try {
      return await this.client.validateApiKey();
    } catch (err) {
      this.logger?.error('Failed to validate API key', err);
      return false;
    }
  }
}
