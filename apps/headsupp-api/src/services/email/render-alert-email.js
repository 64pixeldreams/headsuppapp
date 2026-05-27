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

function safeColor(value, fallback = '#1f883d') {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
  return fallback;
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
  if (severity === 'recovered' || severity === 'recovery') return 'Recovered';
  return 'Warning';
}

function buildDefaultTitle(alert, labels = {}, channel = {}) {
  if (labels.title) return labels.title;
  if (channel?.name) return channel.name;
  const summary = String(alert.summary_text || '');
  const beforeStatus = summary.split(/\sis\s(?:warning|critical|recovery|recovered)\sat\s/i)[0]?.trim();
  const trimmed = beforeStatus || summary;
  const normalized = trimmed.replace(/\s+(high|low)$/i, '').trim();
  return normalized || 'Heads Up alert';
}

function buildDefaultSummary({ labels, currentValue, thresholdValue }) {
  const signal = labels.signal_label || 'Signal';
  const threshold = labels.threshold_label || 'Threshold';
  return `${signal} reached ${currentValue}. ${threshold}: ${thresholdValue}.`;
}

function buildDisplayTitle(title, currentValue, { appendValue = true } = {}) {
  const base = String(title || 'Heads Up alert').trim();
  const value = String(currentValue || '').trim();
  if (!appendValue || !value || base.includes(value)) return base;
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

function normalizeMetric(metric) {
  if (!metric || typeof metric !== 'object') return null;
  const label = String(metric.label || metric.name || '').trim();
  const value = String(metric.value ?? metric.display_value ?? '').trim();
  if (!label || !value) return null;
  return {
    label,
    value,
    subline: metric.subline || metric.detail || null,
    status: metric.status || null,
  };
}

function metricFromDisplay(display, key, label, subline = null) {
  const value = display?.[key];
  if (value === undefined || value === null || value === '') return null;
  return normalizeMetric({ label, value, subline });
}

function buildDefaultMetrics(context, { currentLabel = context.current_label, thresholdLabel = context.threshold_label } = {}) {
  return [
    normalizeMetric({ label: currentLabel || 'Current value', value: context.current_value_display }),
    normalizeMetric({ label: thresholdLabel || 'Threshold', value: context.threshold_value_display }),
  ].filter(Boolean);
}

function buildDisplayMetrics(context) {
  const display = context.fields?.display && typeof context.fields.display === 'object' ? context.fields.display : {};
  const metrics = [
    metricFromDisplay(display, 'current_value', context.current_label || 'Current value'),
    metricFromDisplay(display, 'threshold_value', context.threshold_label || 'Threshold'),
    metricFromDisplay(display, 'target', 'Target'),
    metricFromDisplay(display, 'gap', 'Gap'),
    metricFromDisplay(display, 'days_remaining', 'Time left'),
  ].filter(Boolean);
  return metrics.length ? metrics : buildDefaultMetrics(context);
}

function buildMetricRows(context) {
  const fromPayload = Array.isArray(context.fields?.metrics)
    ? context.fields.metrics.map(normalizeMetric).filter(Boolean)
    : [];
  if (fromPayload.length) return fromPayload;
  return buildDisplayMetrics(context);
}

function buildForecastRows(context) {
  const fromPayload = Array.isArray(context.fields?.metrics)
    ? context.fields.metrics.map(normalizeMetric).filter(Boolean)
    : [];
  if (fromPayload.length) return fromPayload;

  const display = context.fields?.display && typeof context.fields.display === 'object' ? context.fields.display : {};
  const fields = context.fields || {};
  const rows = [
    metricFromDisplay(display, 'actual_to_date', 'Actual to date')
      || normalizeMetric({ label: 'Actual to date', value: fields.actual_to_date_display }),
    metricFromDisplay(display, 'target', 'Target')
      || normalizeMetric({ label: 'Target', value: fields.target_display }),
    metricFromDisplay(display, 'gap', 'Gap')
      || normalizeMetric({ label: 'Gap', value: fields.gap_display }),
    metricFromDisplay(display, 'days_remaining', 'Time left')
      || normalizeMetric({ label: 'Time left', value: fields.days_remaining_display }),
    metricFromDisplay(display, 'pace_percent', 'Pace')
      || metricFromDisplay(display, 'current_value', 'Pace'),
    metricFromDisplay(display, 'threshold_value', 'Pace threshold'),
  ].filter(Boolean);

  return rows.length ? rows : buildDefaultMetrics(context, { currentLabel: 'Pace', thresholdLabel: 'Pace threshold' });
}

function buildSpendRows(context) {
  const fromPayload = Array.isArray(context.fields?.metrics)
    ? context.fields.metrics.map(normalizeMetric).filter(Boolean)
    : [];
  if (fromPayload.length) return fromPayload;

  const display = context.fields?.display && typeof context.fields.display === 'object' ? context.fields.display : {};
  const rows = [
    metricFromDisplay(display, 'current_value', context.current_label || 'Amount'),
    metricFromDisplay(display, 'threshold_value', context.threshold_label || 'Budget'),
    metricFromDisplay(display, 'merchant', 'Merchant'),
  ].filter(Boolean);
  return rows.length ? rows : buildDefaultMetrics(context, { currentLabel: 'Amount', thresholdLabel: 'Budget' });
}

const DEFAULT_COMPANY_LINE = 'INC64 LLC. 30N St Ste N, Sheridan, WY 82801.';

function normalizeBranding(config = {}, defaults = {}) {
  const branding = config.branding && typeof config.branding === 'object' ? config.branding : {};
  const icons = branding.icons && typeof branding.icons === 'object' ? branding.icons : {};
  return {
    brand_name: branding.brand_name || config.brand_name || 'Heads Up',
    title: branding.title || branding.brand_name || config.brand_name || 'Heads Up',
    subtitle: branding.subtitle || null,
    logo_url: safeUrl(branding.logo_url || config.logo_url || null),
    accent_color: safeColor(branding.accent_color || config.accent_color),
    footer_text: branding.footer_text || defaults.footer_text || 'Fewer surprises. Just a heads up.',
    company_line: branding.company_line || branding.company_info || defaults.company_line || DEFAULT_COMPANY_LINE,
    icons: {
      alert: safeUrl(icons.alert_url || icons.alert || branding.icon_url || null),
      warning: safeUrl(icons.warning_url || icons.warning || icons.alert_url || icons.alert || branding.icon_url || null),
      critical: safeUrl(icons.critical_url || icons.critical || icons.alert_url || icons.alert || branding.icon_url || null),
      recovered: safeUrl(icons.recovered_url || icons.recovered || icons.recovery_url || icons.recovery || null),
      recovery: safeUrl(icons.recovery_url || icons.recovery || icons.recovered_url || icons.recovered || null),
    },
  };
}

function severityStyle(severity) {
  const styles = {
    critical: { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5', label: 'Critical' },
    warning: { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D', label: 'Warning' },
    recovered: { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC', label: 'Recovered' },
    recovery: { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC', label: 'Recovered' },
  };
  return styles[severity] || styles.warning;
}

function statusIcon(severity) {
  if (severity === 'critical') return { label: '!', bg: '#DC2626' };
  if (severity === 'recovered' || severity === 'recovery') return { label: 'OK', bg: '#16A34A' };
  return { label: '!', bg: '#F59E0B' };
}

function iconUrlForContext(context, brand) {
  return safeUrl(
    context.notification?.icon_url
      || context.fields?.icon_url
      || context.fields?.email?.icon_url
      || brand.icons?.[context.severity]
      || brand.icons?.alert
      || null,
  );
}

function renderMetricsTable(metrics) {
  if (!metrics.length) return '';
  const rows = metrics
    .map((metric, index) => {
      const border = index === metrics.length - 1 ? '' : 'border-bottom:1px solid #e5e7eb;';
      return `<tr>
        <td style="padding:12px 14px;${border}font-size:13px;color:#64748b;">${escapeHtml(metric.label)}</td>
        <td align="right" style="padding:12px 14px;${border}font-size:14px;color:#111827;font-weight:700;">${escapeHtml(metric.value)}</td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px 0;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden;">${rows}</table>`;
}

function renderActionControls(actionLinks) {
  if (!actionLinks.length) return '';
  const snoozeLinks = actionLinks.filter((action) => String(action.id || '').startsWith('snooze_')).slice(0, 2);
  const stopWatching = actionLinks.find((action) => action.id === 'stop_watching');
  const otherLinks = actionLinks.filter(
    (action) => !snoozeLinks.includes(action) && action !== stopWatching,
  );
  const buttonStyle = 'display:block;background:#f6f8fa;color:#24292f;text-align:center;text-decoration:none;padding:11px 10px;border:1px solid #d0d7de;border-radius:8px;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;';
  const stopStyle = 'display:block;background:#f6f8fa;color:#24292f;text-align:center;text-decoration:none;padding:11px 10px;border:1px solid #d0d7de;border-radius:8px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;';
  const snoozeRow = snoozeLinks.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 8px 0;"><tr>${snoozeLinks
        .map(
          (action, index) =>
            `<td width="50%" style="padding:${index === 0 ? '0 4px 0 0' : '0 0 0 4px'};"><a href="${escapeHtml(action.url)}" style="${buttonStyle}">${escapeHtml(action.label)}</a></td>`,
        )
        .join('')}${snoozeLinks.length === 1 ? '<td width="50%" style="padding:0 0 0 4px;">&nbsp;</td>' : ''}</tr></table>`
    : '';
  const stopRow = stopWatching
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0;"><tr><td><a href="${escapeHtml(stopWatching.url)}" style="${stopStyle}">${escapeHtml(stopWatching.label)}</a></td></tr></table>`
    : '';
  const otherRows = otherLinks
    .map((action) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:8px 0 0 0;"><tr><td><a href="${escapeHtml(action.url)}" style="${buttonStyle}">${escapeHtml(action.label)}</a></td></tr></table>`)
    .join('');

  return `${snoozeRow}${stopRow}${otherRows}`;
}

function renderBrandShell(context, { metrics = buildDefaultMetrics(context), subjectTitle = context.title } = {}) {
  const brand = context.branding || normalizeBranding();
  const style = severityStyle(context.severity);
  const icon = statusIcon(context.severity);
  const heroIconUrl = iconUrlForContext(context, brand);
  const actionLinks = Array.isArray(context.action_links) ? context.action_links : [];
  const actionTextLines = actionLinks.map((action) => `${action.label}: ${action.url}`);
  const ctaUrl = safeUrl(context.cta_url);
  const accent = safeColor(brand.accent_color);
  const escapedBrand = escapeHtml(brand.brand_name);
  const headerTitle = brand.title ? escapeHtml(brand.title) : null;
  const headerSubtitle = brand.subtitle ? escapeHtml(brand.subtitle) : null;
  const contextLine = context.context_line ? escapeHtml(context.context_line) : null;
  const escapedRecipient = context.recipient_name ? escapeHtml(context.recipient_name) : null;
  const escapedTitle = escapeHtml(context.title);
  const escapedSummary = escapeHtml(context.summary);
  const escapedDetail = escapeHtml(context.detail || '');
  const escapedFooter = escapeHtml(brand.footer_text || 'Fewer surprises. Just a heads up.');
  const companyLine = brand.company_line ? escapeHtml(brand.company_line) : null;
  const metricsHtml = renderMetricsTable(metrics);
  const actionHtml = renderActionControls(actionLinks);

  const text = [
    brand.brand_name,
    context.context_line || null,
    '',
    escapedRecipient ? `Hi ${context.recipient_name},` : null,
    context.title,
    '',
    context.summary,
    context.detail ? '' : null,
    context.detail || null,
    '',
    ...metrics.map((metric) => `${metric.label}: ${metric.value}`),
    ctaUrl ? '' : null,
    ctaUrl ? `${context.cta_label}: ${ctaUrl}` : null,
    actionTextLines.length ? '' : null,
    actionTextLines.length ? 'Alert controls:' : null,
    ...actionTextLines,
    context.unsubscribe_url ? '' : null,
    context.unsubscribe_url ? `Unsubscribe: ${context.unsubscribe_url}` : null,
    '',
    brand.footer_text || 'Fewer surprises. Just a heads up.',
    brand.company_line || null,
  ].filter((line) => line !== null).join('\n');

  const logoHtml = brand.logo_url
    ? `<td width="56" valign="top"><img src="${escapeHtml(brand.logo_url)}" width="48" height="48" alt="${escapedBrand}" style="display:block;border:0;border-radius:10px;"></td>`
    : '';
  const headerTextHtml = headerTitle || headerSubtitle || contextLine
    ? `<td valign="top" style="${brand.logo_url ? 'padding-left:10px;' : ''}">
                      ${headerTitle ? `<div style="font-size:15px;font-weight:700;line-height:1.3;color:#24292f;">${headerTitle}</div>` : ''}
                      ${headerSubtitle ? `<div style="margin-top:2px;font-size:13px;line-height:1.35;color:#57606a;">${headerSubtitle}</div>` : ''}
                      ${contextLine ? `<div style="margin-top:2px;font-size:13px;line-height:1.35;color:#57606a;">${contextLine}</div>` : ''}
                    </td>`
    : '';
  const headerHtml = logoHtml || headerTextHtml
    ? `<tr>
              <td style="padding:0 0 14px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                  <tr>
                    ${logoHtml}
                    ${headerTextHtml}
                  </tr>
                </table>
              </td>
            </tr>`
    : '';
  const heroIconHtml = heroIconUrl
    ? `<img src="${escapeHtml(heroIconUrl)}" width="64" height="64" alt="" style="display:block;border:0;border-radius:16px;margin:0 auto 14px auto;">`
    : `<div style="width:52px;height:52px;border-radius:16px;background:${icon.bg};color:#ffffff;font-size:24px;line-height:52px;text-align:center;font-weight:800;margin:0 auto 14px auto;">${icon.label}</div>`;

  const html = `<!doctype html>
<html>
  <body style="box-sizing:border-box;margin:0;padding:0;background:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="box-sizing:border-box;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;border-collapse:collapse;">
            ${headerHtml}
            <tr>
              <td style="background:#ffffff;border:1px solid #d0d7de;border-radius:6px;overflow:hidden;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" style="padding:24px 24px 20px 24px;border-bottom:1px solid #d8dee4;">
                      ${heroIconHtml}
                      ${escapedRecipient ? `<p style="margin:0 0 12px 0;font-size:14px;color:#57606a;">Hi ${escapedRecipient},</p>` : ''}
                      <h1 style="margin:0 0 10px 0;font-size:21px;line-height:1.3;font-weight:700;color:#24292f;">${escapedTitle}</h1>
                      <p style="margin:0 0 14px 0;">
                        <span style="display:inline-block;background:${style.bg};color:${style.text};border:1px solid ${style.border};padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;">${style.label}</span>
                      </p>
                      <p style="margin:0 auto 0 auto;max-width:440px;font-size:15px;line-height:1.55;color:#24292f;">${escapedSummary}</p>
                      ${context.detail ? `<p style="margin:10px auto 0 auto;max-width:440px;font-size:13px;line-height:1.55;color:#57606a;">${escapedDetail}</p>` : ''}
                      ${
                        ctaUrl
                          ? `<p style="margin:18px 0 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;min-width:148px;background:${accent};color:#ffffff;text-align:center;text-decoration:none;padding:11px 18px;border:1px solid ${accent};border-radius:6px;font-size:14px;font-weight:700;">${escapeHtml(context.cta_label || 'View details')}</a></p>`
                          : ''
                      }
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px 18px 24px;">
                      ${metricsHtml}
                      ${
                        ctaUrl
                          ? `<p style="margin:0 0 16px 0;font-size:12px;line-height:1.5;color:#57606a;">Button not working? Open this link: <a href="${escapeHtml(ctaUrl)}" style="color:#0969da;">${escapeHtml(ctaUrl)}</a></p>`
                          : ''
                      }
                      ${
                        actionLinks.length
                          ? `<div style="margin:0 0 16px 0;"><p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">Alert controls</p>${actionHtml}</div>`
                          : ''
                      }
                      ${
                        context.unsubscribe_url
                          ? `<p style="margin:0 0 10px 0;font-size:12px;color:#57606a;">If you no longer want these emails, <a href="${escapeHtml(context.unsubscribe_url)}" style="color:#0969da;">unsubscribe</a>.</p>`
                          : ''
                      }
                      <p style="margin:14px 0 0 0;font-size:12px;color:#57606a;">${escapedFooter}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${companyLine ? `<tr><td align="center" style="padding:14px 10px 0 10px;font-size:11px;line-height:1.5;color:#6e7781;">${companyLine}</td></tr>` : ''}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: `${titlePrefix(context.severity)}: ${subjectTitle}`,
    text,
    html,
  };
}

function renderBaseAlertTemplate(context) {
  return renderBrandShell(context, {
    metrics: buildDefaultMetrics(context),
    subjectTitle: buildDisplayTitle(context.title, context.current_value_display, { appendValue: context.append_value_to_title }),
  });
}

function renderBrandAlertTemplate(context) {
  return renderBrandShell(context, {
    metrics: buildMetricRows(context),
    subjectTitle: context.subject_title || context.title,
  });
}

function renderMetricAlertTemplate(context) {
  return renderBrandShell(
    {
      ...context,
      context_line: context.context_line || context.fields?.resource_name || context.channel?.name || null,
    },
    {
      metrics: buildMetricRows(context),
      subjectTitle: context.subject_title || context.title,
    },
  );
}

function renderForecastAlertTemplate(context) {
  const resourceName = context.fields?.forecast_name || context.fields?.goal_name || context.fields?.resource_name || context.channel?.name;
  const title = context.notification?.title || resourceName || context.title;
  const contextLine = [
    context.branding?.brand_name || context.brand_name,
    resourceName && resourceName !== title ? resourceName : null,
  ].filter(Boolean).join(' - ');
  return renderBrandShell(
    {
      ...context,
      title,
      context_line: context.context_line || contextLine,
      cta_label: context.cta_label || 'View forecast',
    },
    {
      metrics: buildForecastRows(context),
      subjectTitle: context.subject_title || title,
    },
  );
}

function renderSpendAlertTemplate(context) {
  const merchant = context.fields?.merchant || context.fields?.vendor || null;
  return renderBrandShell(
    {
      ...context,
      context_line: context.context_line || merchant || context.channel?.name || null,
    },
    {
      metrics: buildSpendRows(context),
      subjectTitle: context.subject_title || context.title,
    },
  );
}

const TEMPLATE_REGISTRY = Object.freeze({
  base_alert_v1: renderBaseAlertTemplate,
  brand_alert_v1: renderBrandAlertTemplate,
  metric_alert_v1: renderMetricAlertTemplate,
  forecast_alert_v1: renderForecastAlertTemplate,
  spend_alert_v1: renderSpendAlertTemplate,
});

function inferTemplateId({ subscriberConfig = {}, alert, fields = {}, templateRegistry = {} }) {
  const bySeverity = subscriberConfig.template_by_severity || {};
  const mapped = bySeverity[alert.severity];
  if (mapped && templateRegistry[mapped]) return mapped;
  const explicit = subscriberConfig.template_id;
  if (explicit && templateRegistry[explicit]) return explicit;
  if (fields?.email?.template_id && templateRegistry[fields.email.template_id]) return fields.email.template_id;
  if (fields.event_type === 'forecast_state' || fields.template_kind === 'forecast' || fields.forecast_name || fields.goal_name) {
    return 'forecast_alert_v1';
  }
  if (fields.template_kind === 'spend' || fields.merchant || fields.vendor) return 'spend_alert_v1';
  if (Array.isArray(fields.metrics) && fields.metrics.length > 0) return 'metric_alert_v1';
  return 'brand_alert_v1';
}

export function renderAlertEmail({ alert, subscriber, channel, unsubscribe_url = null, action_links = [], defaults = {} }) {
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

  const baseTitle = notification.title || buildDefaultTitle(alert, labels, channel);
  const templateValues = {
    title: baseTitle,
    value: currentValueDisplay,
    current_value: currentValueDisplay,
    threshold: thresholdValueDisplay,
    threshold_value: thresholdValueDisplay,
    severity: alert.severity || 'warning',
  };
  const titleTemplate = notification.title_template || labels.title_template || subscriberConfig.title_template;
  const title =
    renderTemplate(titleTemplate, templateValues) ||
    buildDisplayTitle(baseTitle, currentValueDisplay, { appendValue: !notification.title });
  const summary = notification.summary || renderTemplate(labels.summary_template || subscriberConfig.summary_template, templateValues) || buildDefaultSummary({
    labels,
    currentValue: currentValueDisplay,
    thresholdValue: thresholdValueDisplay,
  });

  const templateId = inferTemplateId({
    subscriberConfig,
    alert,
    fields,
    templateRegistry: TEMPLATE_REGISTRY,
  });
  const renderer = TEMPLATE_REGISTRY[templateId] || TEMPLATE_REGISTRY.brand_alert_v1;
  const branding = normalizeBranding(subscriberConfig, defaults);
  const contextLine = fields.context_line || fields.resource_name || channelMetadata.resource_name || null;
  const context = {
    title,
    subject_title: notification.subject || null,
    summary,
    detail: notification.detail || '',
    notification,
    severity: alert.severity || 'warning',
    current_value_display: currentValueDisplay,
    threshold_value_display: thresholdValueDisplay,
    current_label: labels.current_label || 'Current value',
    threshold_label: labels.threshold_label || 'Threshold',
    brand_name: branding.brand_name,
    branding,
    footer_text: branding.footer_text,
    recipient_name: recipientName,
    cta_url: ctaUrl,
    cta_label: ctaLabel,
    unsubscribe_url,
    action_links,
    fields,
    channel,
    channel_metadata: channelMetadata,
    context_line: contextLine,
    template_id: templateId,
    append_value_to_title: !notification.title && !titleTemplate,
  };

  return {
    template_id: templateId,
    action_ids: action_links.map((action) => action.id),
    ...renderer(context),
  };
}
