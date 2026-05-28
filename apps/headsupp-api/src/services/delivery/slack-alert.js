function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mrkdwn(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function severityLabel(severity) {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'critical') return ':rotating_light: Critical';
  if (normalized === 'recovered' || normalized === 'recovery') return ':white_check_mark: Recovered';
  if (normalized === 'info') return ':information_source: Info';
  return ':warning: Warning';
}

function severityText(severity) {
  return severityLabel(severity).replace(/:[a-z_]+:/g, '').trim();
}

function renderTemplate(template, values = {}) {
  if (!template) return null;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function valueMap(alert, channelMetadata = {}) {
  return {
    value: alert.current_value,
    current_value: alert.current_value,
    threshold: alert.threshold_value,
    threshold_value: alert.threshold_value,
    severity: alert.severity,
    summary: alert.summary_text,
    alert_id: alert.id,
    watch_id: alert.watch_id,
    channel_id: alert.channel_id,
    signal_id: alert.signal_id,
    ...channelMetadata,
  };
}

function titleFromAlert(alert, labels = {}, channelMetadata = {}) {
  const values = valueMap(alert, channelMetadata);
  const templated = renderTemplate(labels.title_template || labels.title, values);
  if (templated) return templated;
  return alert.summary_text || 'Heads Up alert';
}

function summaryFromAlert(alert, labels = {}, channelMetadata = {}) {
  const values = valueMap(alert, channelMetadata);
  const templated = renderTemplate(labels.summary_template || labels.summary, values);
  if (templated) return templated;
  return alert.summary_text || 'A watched metric needs attention.';
}

function contextLine(alert, config = {}, channelMetadata = {}) {
  const source = config.source_label || config.branding?.source_label || config.branding?.brand_name || 'Heads Up';
  const parts = [
    source,
    channelMetadata.forecast_name || channelMetadata.resource_name || null,
    channelMetadata.forecast_id ? `forecast ${channelMetadata.forecast_id}` : null,
  ].filter(Boolean);
  return parts.join(' • ');
}

function fieldBlock(label, value) {
  if (value === undefined || value === null || value === '') return null;
  return {
    type: 'mrkdwn',
    text: `*${mrkdwn(label)}*\n${mrkdwn(value)}`,
  };
}

export function slackAlertPayload(alert, { subscriber = {}, channelMetadata = {} } = {}) {
  const config = parseJson(subscriber.config_json, {});
  const labels = config.labels && typeof config.labels === 'object' ? config.labels : {};
  const title = titleFromAlert(alert, labels, channelMetadata);
  const summary = summaryFromAlert(alert, labels, channelMetadata);
  const severity = severityLabel(alert.severity);
  const context = contextLine(alert, config, channelMetadata);
  const ctaLabel = alert.cta_label || config.cta_label || 'View alert';
  const currentLabel = labels.current_label || 'Current';
  const thresholdLabel = labels.threshold_label || 'Threshold';
  const watchLabel = labels.watch_label || 'Watch';

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${severityText(alert.severity)}: ${title}`.slice(0, 150),
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: mrkdwn(summary).slice(0, 3000),
      },
    },
    {
      type: 'section',
      fields: [
        fieldBlock(currentLabel, alert.current_value),
        fieldBlock(thresholdLabel, alert.threshold_value),
        fieldBlock('Severity', alert.severity),
        fieldBlock(watchLabel, labels.watch_value || channelMetadata.watch_name || alert.watch_id),
      ].filter(Boolean),
    },
  ];

  if (alert.cta_url) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: ctaLabel.slice(0, 75),
            emoji: true,
          },
          url: alert.cta_url,
        },
      ],
    });
  }

  if (context) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: mrkdwn(context).slice(0, 2000),
        },
      ],
    });
  }

  return {
    text: `${severityText(alert.severity)}: ${title}. ${summary}`.replace(/\s+/g, ' ').trim().slice(0, 3000),
    blocks,
  };
}
