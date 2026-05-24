/**
 * Template loader and registry
 */

import { passwordResetTemplate } from './password-reset.js';
import { welcomeTemplate } from './welcome.js';
import { verificationTemplate } from './verification.js';
import { apiKeyTemplate } from './api-key.js';
import { notificationTemplate } from './notification.js';

// Slack templates
import { slackAlertTemplate } from './slack/alert.js';
import { slackSuccessTemplate } from './slack/success.js';
import { slackErrorTemplate } from './slack/error.js';

// Template registry
const templates = {
  // Email templates
  'password-reset': passwordResetTemplate,
  'welcome': welcomeTemplate,
  'verification': verificationTemplate,
  'api-key': apiKeyTemplate,
  'notification': notificationTemplate,
  
  // Slack templates
  'slack-alert': slackAlertTemplate,
  'slack-success': slackSuccessTemplate,
  'slack-error': slackErrorTemplate
};

/**
 * Load a template by name
 * @param {string} name - Template name
 * @returns {object|null} Template definition or null if not found
 */
export function loadTemplate(name) {
  return templates[name] || null;
}

/**
 * Get all available template names
 * @returns {string[]}
 */
export function getTemplateNames() {
  return Object.keys(templates);
}

/**
 * Register a custom template
 * @param {string} name - Template name
 * @param {object} template - Template definition
 */
export function registerTemplate(name, template) {
  if (!name || !template) {
    throw new Error('Template name and definition are required');
  }

  if (!template.subject || !template.html) {
    throw new Error('Template must have subject and html properties');
  }

  templates[name] = template;
}
