/**
 * Slack success notification template
 */

export const slackSuccessTemplate = {
  name: 'slack-success',
  channel: 'slack',
  requiredData: ['title'],
  defaultData: {
    icon_emoji: ':white_check_mark:'
  },
  
  /**
   * Build the Slack message
   * @param {object} data - Template data
   * @returns {object} Slack message format
   */
  build(data) {
    const emoji = data.icon_emoji || ':white_check_mark:';
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${data.title}`,
          emoji: true
        }
      }
    ];

    // Add description if provided
    if (data.description) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: data.description
        }
      });
    }

    // Add metrics if provided
    if (data.metrics && Object.keys(data.metrics).length > 0) {
      const fields = Object.entries(data.metrics).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n${value}`
      }));

      blocks.push({
        type: 'section',
        fields: fields.slice(0, 10) // Slack limits to 10 fields
      });
    }

    // Add context footer
    const contextElements = [];
    if (data.duration) {
      contextElements.push({
        type: 'plain_text',
        text: `Duration: ${data.duration}`
      });
    }
    if (data.user) {
      contextElements.push({
        type: 'plain_text',
        text: `By: ${data.user}`
      });
    }
    contextElements.push({
      type: 'plain_text',
      text: new Date().toLocaleString()
    });

    blocks.push({
      type: 'context',
      elements: contextElements
    });

    return {
      text: `${emoji} ${data.title}`,
      blocks
    };
  }
};
