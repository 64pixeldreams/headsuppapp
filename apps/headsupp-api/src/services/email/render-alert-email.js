function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeFormatProfile(profile) {
  return String(profile || '').trim().toLowerCase() || 'decimal_2';
}

function formatNumericValue(value, { profile = 'decimal_2', locale = 'en-US' } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  const normalized = normalizeFormatProfile(profile);

  if (normalized.startsWith('money_')) {
    const parts = normalized.split('_');
    const currency = (parts[1] || 'usd').toUpperCase();
    const precision = Number(parts[2] ?? 2);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(number);
  }

  if (normalized.startsWith('percent_')) {
    const precision = Number(normalized.split('_')[1] ?? 1);
    return `${number.toFixed(Math.max(0, precision))}%`;
  }

  if (normalized.startsWith('decimal_')) {
    const precision = Number(normalized.split('_')[1] ?? 2);
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: Math.max(0, precision),
      maximumFractionDigits: Math.max(0, precision),
    }).format(number);
  }

  return new Intl.NumberFormat(locale).format(number);
}

function titlePrefix(severity) {
  if (severity === 'critical') return 'Critical';
  if (severity === 'recovered') return 'Recovered';
  return 'Warning';
}

function buildDefaultTitle(alert, labels = {}) {
  if (labels.title) return labels.title;
  const summary = String(alert.summary_text || '');
  const beforeStatus = summary.split(/\sis\s(?:warning|critical|recovery|recovered)\sat\s/i)[0]?.trim();
  const trimmed = beforeStatus || summary;
  const normalized = trimmed.replace(/\s+(high|low)$/i, '').trim();
  return normalized || 'Heads Up alert';
}

function buildDefaultSummary({ alert, labels, currentValue, thresholdValue }) {
  const signal = labels.signal_label || 'Signal';
  const threshold = labels.threshold_label || 'Threshold';
  return `${signal} reached ${currentValue}. ${threshold}: ${thresholdValue}.`;
}

function buildDisplayTitle(title, currentValue) {
  const base = String(title || 'Heads Up alert').trim();
  const value = String(currentValue || '').trim();
  if (!value || base.includes(value)) return base;
  return `${base}: ${value}`;
}

function renderTemplate(template, values = {}) {
  if (!template) return null;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function looksGenericRecipientLabel(value) {
  return /alert|subscriber|channel|callback|webhook/i.test(String(value || ''));
}

function humanizeEmailRecipient(email) {
  const local = String(email || '').split('@')[0] || '';
  if (!local) return null;
  const normalized = local.replace(/[._-]+/g, ' ').trim();
  if (!normalized) return null;
  return normalized
    .split(/\s+/)
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : part))
    .join(' ');
}

function selectTemplateId({ subscriberConfig = {}, alert, templateRegistry = {} }) {
  const bySeverity = subscriberConfig.template_by_severity || {};
  const mapped = bySeverity[alert.severity];
  if (mapped && templateRegistry[mapped]) return mapped;
  const explicit = subscriberConfig.template_id || 'base_alert_v1';
  if (templateRegistry[explicit]) return explicit;
  return 'base_alert_v1';
}

function renderBaseAlertTemplate(context) {
  const escapedTitle = escapeHtml(context.title);
  const escapedSummary = escapeHtml(context.summary);
  const escapedDetail = escapeHtml(context.detail || '');
  const escapedCurrent = escapeHtml(context.current_value_display);
  const escapedThreshold = escapeHtml(context.threshold_value_display);
  const escapedFooter = escapeHtml(context.footer_text || 'Fewer surprises. Just a heads up.');
  const escapedBrand = escapeHtml(context.brand_name || 'Heads Up');
  const escapedRecipient = context.recipient_name ? escapeHtml(context.recipient_name) : null;
  const actionLinks = Array.isArray(context.action_links) ? context.action_links : [];
  const actionTextLines = actionLinks.map((action) => `${action.label}: ${action.url}`);
  const actionHtml = actionLinks
    .map(
      (action) =>
        `<a href="${escapeHtml(action.url)}" style="display:inline-block;min-width:104px;margin:0 8px 8px 0;background:#f1f5f9;color:#111827;text-align:center;text-decoration:none;padding:10px 14px;border:1px solid #cbd5e1;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">${escapeHtml(action.label)}</a>`,
    )
    .join('');

  const severityStyles = {
    critical: {
      bg: '#FEE2E2',
      text: '#B91C1C',
      border: '#FCA5A5',
      label: 'Critical',
    },
    warning: {
      bg: '#FEF3C7',
      text: '#B45309',
      border: '#FCD34D',
      label: 'Warning',
    },
    recovered: {
      bg: '#DCFCE7',
      text: '#15803D',
      border: '#86EFAC',
      label: 'Recovered',
    },
    recovery: {
      bg: '#DCFCE7',
      text: '#15803D',
      border: '#86EFAC',
      label: 'Recovered',
    },
  };
  const severityStyle = severityStyles[context.severity] || severityStyles.warning;

  const lines = [
    escapedBrand,
    '',
    escapedRecipient ? `Hi ${escapedRecipient},` : null,
    escapedTitle,
    '',
    escapedSummary,
    context.detail ? '' : null,
    context.detail ? context.detail : null,
    '',
    `${context.current_label}: ${context.current_value_display}`,
    `${context.threshold_label}: ${context.threshold_value_display}`,
    context.cta_url ? '' : null,
    context.cta_url ? `${context.cta_label}: ${context.cta_url}` : null,
    actionTextLines.length ? '' : null,
    actionTextLines.length ? 'Alert controls:' : null,
    ...actionTextLines,
    context.unsubscribe_url ? '' : null,
    context.unsubscribe_url ? `Unsubscribe: ${context.unsubscribe_url}` : null,
    '',
    context.footer_text || 'Fewer surprises. Just a heads up.',
  ].filter((line) => line !== null);

  const text = lines.join('\n');
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
            <tr><td style="padding:20px 24px;background:#111827;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">${escapedBrand}</td></tr>
            <tr>
              <td style="padding:28px 24px 24px 24px;">
                ${escapedRecipient ? `<p style="margin:0 0 14px 0;font-size:14px;color:#374151;">Hi ${escapedRecipient},</p>` : ''}
                <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;letter-spacing:-0.025em;">${escapedTitle}</h1>
                <p style="margin:0 0 12px 0;">
                  <span style="display:inline-block;background:${severityStyle.bg};color:${severityStyle.text};border:1px solid ${severityStyle.border};padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.02em;">
                    ${severityStyle.label}
                  </span>
                </p>
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">${escapedSummary}</p>
                ${context.detail ? `<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#374151;">${escapedDetail}</p>` : ''}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px 0;border:1px solid #e5e7eb;border-radius:8px;">
                  <tr><td style="padding:10px 12px;font-size:13px;"><strong>${escapeHtml(context.current_label)}:</strong> ${escapedCurrent}</td></tr>
                  <tr><td style="padding:10px 12px;font-size:13px;"><strong>${escapeHtml(context.threshold_label)}:</strong> ${escapedThreshold}</td></tr>
                </table>
                ${
                  context.cta_url
                    ? `<p style="margin:0 0 16px 0;"><a href="${escapeHtml(context.cta_url)}" style="display:inline-block;min-width:148px;background:#f1f5f9;color:#111827;text-align:center;text-decoration:none;padding:11px 16px;border:1px solid #cbd5e1;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">${escapeHtml(String(context.cta_label || 'View details').toUpperCase())}</a></p>`
                    : ''
                }
                ${
                  actionLinks.length
                    ? `<div style="margin:0 0 16px 0;"><p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">Alert controls</p>${actionHtml}</div>`
                    : ''
                }
                ${
                  context.unsubscribe_url
                    ? `<p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;">If you no longer want these emails, <a href="${escapeHtml(context.unsubscribe_url)}">unsubscribe</a>.</p>`
                    : ''
                }
                <p style="margin:16px 0 0 0;font-size:12px;color:#6b7280;">${escapedFooter}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: `${titlePrefix(context.severity)}: ${context.title}`,
    text,
    html,
  };
}

const TEMPLATE_REGISTRY = Object.freeze({
  base_alert_v1: renderBaseAlertTemplate,
});

export function renderAlertEmail({ alert, subscriber, channel, unsubscribe_url = null, action_links = [] }) {
  const payload = parseJson(alert.payload_json, {});
  const fields = parseJson(payload.fields, {});
  const channelMetadata = parseJson(channel?.metadata_json, {});
  const subscriberConfig = parseJson(subscriber?.config_json, {});
  const notification = fields.notification && typeof fields.notification === 'object' ? fields.notification : {};
  const labels = subscriberConfig.labels && typeof subscriberConfig.labels === 'object' ? subscriberConfig.labels : {};
  const locale = subscriberConfig.locale || 'en-US';
  const valueFormat = subscriberConfig.value_format || 'decimal_2';
  const currentValueDisplay =
    fields?.display?.current_value || formatNumericValue(alert.current_value, { profile: valueFormat, locale });
  const thresholdValueDisplay =
    fields?.display?.threshold_value || formatNumericValue(alert.threshold_value, { profile: valueFormat, locale });
  const ctaUrl = safeUrl(alert.cta_url || payload?.cta?.url || subscriberConfig?.defaults?.cta_url || null);
  const ctaLabel = payload?.cta?.label || alert.cta_label || subscriberConfig?.defaults?.cta_label || 'View details';
  const configuredRecipientName = subscriberConfig?.recipient_name || subscriberConfig?.name || null;
  const subscriberName = subscriber.name || subscriber.display_name || null;
  const fallbackRecipientFromEmail = humanizeEmailRecipient(subscriber.destination_url);
  const recipientName = configuredRecipientName
    || (subscriberName && !looksGenericRecipientLabel(subscriberName) ? subscriberName : null)
    || fallbackRecipientFromEmail
    || null;

  const baseTitle = notification.title || buildDefaultTitle(alert, labels);
  const templateValues = {
    title: baseTitle,
    value: currentValueDisplay,
    current_value: currentValueDisplay,
    threshold: thresholdValueDisplay,
    threshold_value: thresholdValueDisplay,
    severity: alert.severity || 'warning',
  };
  const title =
    renderTemplate(notification.title_template || labels.title_template || subscriberConfig.title_template, templateValues) ||
    buildDisplayTitle(baseTitle, currentValueDisplay);
  const summary = notification.summary || renderTemplate(labels.summary_template || subscriberConfig.summary_template, templateValues) || buildDefaultSummary({
    alert,
    labels,
    currentValue: currentValueDisplay,
    thresholdValue: thresholdValueDisplay,
  });

  const templateId = selectTemplateId({
    subscriberConfig,
    alert,
    templateRegistry: TEMPLATE_REGISTRY,
  });
  const renderer = TEMPLATE_REGISTRY[templateId] || TEMPLATE_REGISTRY.base_alert_v1;
  const context = {
    title,
    summary,
    detail: notification.detail || '',
    severity: alert.severity || 'warning',
    current_value_display: currentValueDisplay,
    threshold_value_display: thresholdValueDisplay,
    current_label: labels.current_label || 'Current value',
    threshold_label: labels.threshold_label || 'Threshold',
    brand_name: subscriberConfig?.branding?.brand_name || 'Heads Up',
    footer_text: subscriberConfig?.branding?.footer_text || 'Fewer surprises. Just a heads up.',
    recipient_name: recipientName,
    cta_url: ctaUrl,
    cta_label: ctaLabel,
    unsubscribe_url,
    action_links,
    fields,
    channel_metadata: channelMetadata,
    template_id: templateId,
  };

  return {
    template_id: templateId,
    action_ids: action_links.map((action) => action.id),
    ...renderer(context),
  };
}
