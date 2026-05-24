/**
 * Slack alert notification template
 */

export const slackAlertTemplate = {
  name: 'slack-alert',
  channel: 'slack',
  requiredData: ['title', 'message'],
  defaultData: {
    level: 'warning',
    icon_emoji: ':warning:'
  },
  
  /**
   * Build the Slack message
   * @param {object} data - Template data
   * @returns {object} Slack message format
   */
  build(data) {
    const colors = {
      info: '#36a64f',
      warning: '#ff9f00',
      error: '#ff0000',
      critical: '#ff0000'
    };

    const emojis = {
      info: ':information_source:',
      warning: ':warning:',
      error: ':x:',
      critical: ':rotating_light:'
    };

    const level = data.level || 'warning';
    const emoji = data.icon_emoji || emojis[level] || ':bell:';

    return {
      text: `${emoji} ${data.title}`,
      attachments: [{
        color: colors[level] || '#808080',
        fields: [
          {
            title: 'Alert',
            value: data.message,
            short: false
          },
          ...(data.details ? [{
            title: 'Details',
            value: typeof data.details === 'object' 
              ? Object.entries(data.details).map(([k, v]) => `*${k}:* ${v}`).join('\n')
              : data.details,
            short: false
          }] : []),
          ...(data.action ? [{
            title: 'Action Required',
            value: data.action,
            short: false
          }] : [])
        ],
        footer: data.source || 'System Alert',
        ts: Math.floor(Date.now() / 1000)
      }]
    };
  }
};
