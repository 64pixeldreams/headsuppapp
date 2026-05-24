/**
 * Slack error notification template
 */

export const slackErrorTemplate = {
  name: 'slack-error',
  channel: 'slack',
  requiredData: ['title', 'error'],
  defaultData: {
    icon_emoji: ':x:',
    mention: null  // Can be @channel, @here, or specific user
  },
  
  /**
   * Build the Slack message
   * @param {object} data - Template data
   * @returns {object} Slack message format
   */
  build(data) {
    const emoji = data.icon_emoji || ':x:';
    const mention = data.mention ? `${data.mention} ` : '';
    
    // Start with mention if critical
    const text = `${mention}${emoji} ${data.title}`;
    
    const attachments = [{
      color: '#ff0000',
      fields: [],
      footer: 'Error Alert',
      ts: Math.floor(Date.now() / 1000)
    }];

    // Add error message
    attachments[0].fields.push({
      title: 'Error Message',
      value: data.error.message || data.error,
      short: false
    });

    // Add error details if available
    if (data.error.stack) {
      attachments[0].fields.push({
        title: 'Stack Trace',
        value: '```' + data.error.stack.split('\n').slice(0, 5).join('\n') + '```',
        short: false
      });
    }

    // Add context
    if (data.context) {
      attachments[0].fields.push({
        title: 'Context',
        value: typeof data.context === 'object'
          ? Object.entries(data.context).map(([k, v]) => `*${k}:* ${v}`).join('\n')
          : data.context,
        short: false
      });
    }

    // Add request info if available
    if (data.request) {
      const requestInfo = [];
      if (data.request.method) requestInfo.push(`*Method:* ${data.request.method}`);
      if (data.request.url) requestInfo.push(`*URL:* ${data.request.url}`);
      if (data.request.ip) requestInfo.push(`*IP:* ${data.request.ip}`);
      
      if (requestInfo.length > 0) {
        attachments[0].fields.push({
          title: 'Request Info',
          value: requestInfo.join('\n'),
          short: false
        });
      }
    }

    // Add action buttons if provided
    if (data.actions && data.actions.length > 0) {
      attachments[0].actions = data.actions.map(action => ({
        type: 'button',
        text: action.text,
        url: action.url,
        style: action.style || 'danger'
      }));
    }

    return {
      text,
      attachments
    };
  }
};
