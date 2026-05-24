/**
 * MESSAGING module exports
 * Provides multi-channel messaging via email (MailerSend) and Slack
 */

export { Messenger } from './core/messenger.js';

// Export adapters
export { MailerSendAdapter } from './adapters/mailersend.js';
export { SlackAdapter } from './adapters/slack.js';
export { MockMailerSendAdapter } from './mailersend/mock-client.js';
export { MockSlackAdapter } from './adapters/mock-slack.js';

// Export templates
export { loadTemplate, getTemplateNames, registerTemplate } from './templates/index.js';

// Export utilities
export { 
  validateEmail, 
  formatEmail, 
  validateTemplateData,
  validateChannel,
  validateSlackChannel 
} from './utils/validator.js';
export { mergeTemplateData, interpolate, formatDate } from './utils/formatter.js';

// Export individual email templates
export { passwordResetTemplate } from './templates/password-reset.js';
export { welcomeTemplate } from './templates/welcome.js';
export { verificationTemplate } from './templates/verification.js';
export { apiKeyTemplate } from './templates/api-key.js';

// Export Slack templates
export { slackAlertTemplate } from './templates/slack/alert.js';
export { slackSuccessTemplate } from './templates/slack/success.js';
export { slackErrorTemplate } from './templates/slack/error.js';
