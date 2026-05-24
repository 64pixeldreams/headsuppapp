/**
 * Template formatting and merging utilities
 */

import { validateTemplateData } from './validator.js';

/**
 * Merge template with data
 * @param {object} template - Template definition
 * @param {object} data - User-provided data
 * @param {object} env - Environment variables
 * @returns {object} Merged template ready for sending
 */
export function mergeTemplateData(template, data, env) {
  // Validate required fields
  if (template.requiredData) {
    const validation = validateTemplateData(template.requiredData, data);
    if (!validation.valid) {
      throw new Error(`Missing required template data: ${validation.missing.join(', ')}`);
    }
  }

  // Merge with defaults
  const mergedData = {
    ...template.defaultData,
    ...data,
    // Add system variables
    FROM_EMAIL: env.DEFAULT_FROM_EMAIL,
    FROM_NAME: env.DEFAULT_FROM_NAME,
    APP_NAME: env.APP_NAME || 'Our App',
    APP_URL: env.APP_URL || 'https://app.com'
  };

  // Process subject
  const subject = interpolate(template.subject, mergedData);

  // Process HTML
  const html = interpolate(template.html, mergedData);

  // Process text (if provided)
  const text = template.text ? interpolate(template.text, mergedData) : null;

  // Process from address
  const from = {
    email: interpolate(template.from.email, mergedData),
    name: template.from.name ? interpolate(template.from.name, mergedData) : undefined
  };

  return {
    subject,
    html,
    text,
    from
  };
}

/**
 * Interpolate variables in a string
 * Replaces {{variable}} with actual values
 * Handles basic conditionals {{#if variable}}...{{/if}}
 * @param {string} str - String with placeholders
 * @param {object} data - Data object
 * @returns {string}
 */
export function interpolate(str, data) {
  if (!str) return str;

  // Handle conditionals first
  str = str.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    if (data[key]) {
      return interpolate(content, data); // Recursively process content
    }
    return '';
  });

  // Handle else blocks
  str = str.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, 
    (match, key, ifContent, elseContent) => {
      if (data[key]) {
        return interpolate(ifContent, data);
      }
      return interpolate(elseContent, data);
    }
  );

  // Replace simple variables
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (data.hasOwnProperty(key)) {
      return data[key];
    }
    // Return the placeholder if no data found
    return match;
  });
}

/**
 * Format a date for email display
 * @param {Date|string} date - Date to format
 * @param {string} [format] - Format type (short, long, time)
 * @returns {string}
 */
export function formatDate(date, format = 'short') {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    return 'Invalid date';
  }

  const options = {
    short: { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    },
    long: { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    },
    time: { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true 
    }
  };

  return d.toLocaleString('en-US', options[format] || options.short);
}

/**
 * Generate a preview text from HTML
 * Strips HTML and returns first N characters
 * @param {string} html - HTML content
 * @param {number} [length] - Max length
 * @returns {string}
 */
export function generatePreviewText(html, length = 150) {
  if (!html) return '';

  // Remove HTML tags
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate if needed
  if (text.length <= length) {
    return text;
  }

  // Find last space before limit
  const lastSpace = text.lastIndexOf(' ', length);
  return text.substring(0, lastSpace > 0 ? lastSpace : length) + '...';
}
