/**
 * Message validation and formatting utilities
 * Supports email and Slack channel validation
 */

/**
 * Validate email address format
 * @param {string} email - Email address to validate
 * @returns {boolean}
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic email regex - comprehensive but not overly strict
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Format email with optional name
 * @param {string|object} email - Email address or object with email/name
 * @param {string} [defaultName] - Default name if not provided
 * @returns {{email: string, name?: string}}
 */
export function formatEmail(email, defaultName = null) {
  // Handle object format
  if (typeof email === 'object' && email !== null) {
    return {
      email: email.email?.trim(),
      name: email.name?.trim() || defaultName
    };
  }

  // Handle string format
  if (typeof email === 'string') {
    return {
      email: email.trim(),
      name: defaultName
    };
  }

  throw new Error('Invalid email format');
}

/**
 * Validate required template data
 * @param {array} required - Required field names
 * @param {object} data - Provided data
 * @returns {{valid: boolean, missing: array}}
 */
export function validateTemplateData(required, data) {
  const missing = [];
  
  for (const field of required) {
    if (!data[field]) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Validate messaging channel
 * @param {string} channel - Channel name
 * @returns {boolean}
 */
export function validateChannel(channel) {
  const validChannels = ['email', 'slack'];
  return validChannels.includes(channel);
}

/**
 * Validate Slack channel name
 * @param {string} channel - Slack channel name
 * @returns {boolean}
 */
export function validateSlackChannel(channel) {
  if (!channel || typeof channel !== 'string') {
    return false;
  }
  
  // Slack channels start with # or @
  // Can also be a channel ID (C1234567890)
  const channelRegex = /^[#@][\w-]+$|^C[A-Z0-9]{8,}$/;
  return channelRegex.test(channel);
}

/**
 * Sanitize HTML content to prevent injection
 * Basic sanitization - for more security, use a dedicated library
 * @param {string} html - HTML content
 * @returns {string}
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  
  // Basic script tag removal
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
}
