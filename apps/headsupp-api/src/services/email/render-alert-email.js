import { ctaVariantStyle, normalizeCtaVariant } from './cta-variants.js';

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
  if (severity === 'success') return 'Success';
  if (severity === 'info') return 'Update';
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

// Opaque resource identifiers (e.g. "oracle_forecast:mn9cxnv3muoleo") should
// never be surfaced as a human title or subtitle. Detect namespaced id tokens
// so we can prefer a real display name instead.
function looksLikeResourceId(value) {
  const text = String(value || '').trim();
  if (!text || /\s/.test(text)) return false;
  return /^[a-z0-9][a-z0-9_-]*:[a-z0-9_-]{4,}$/i.test(text);
}

function firstDisplayName(candidates = []) {
  for (const candidate of candidates) {
    const text = typeof candidate === 'string' ? candidate.trim() : '';
    if (text && !looksLikeResourceId(text)) return text;
  }
  return null;
}

function cleanDebugText(value) {
  const text = String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ');
  return text || null;
}

function buildDebugContext(fields = {}, subscriberConfig = {}) {
  const debug = fields.debug && typeof fields.debug === 'object' && !Array.isArray(fields.debug) ? fields.debug : {};
  const enabled = subscriberConfig.debug === true || debug.mode === 'debug';
  const id = cleanDebugText(debug.id);
  const eventRef = cleanDebugText(debug.event_ref);
  if (!enabled || (!id && !eventRef)) return null;
  const parts = [];
  if (id) parts.push(id);
  if (eventRef) parts.push(`evt ${eventRef}`);
  return {
    id,
    event_ref: eventRef,
    line: `Debug: ${parts.join(' · ')}`,
    subject_suffix: id && subscriberConfig.debug_subject !== false ? `[${id}]` : null,
  };
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

function firstDisplayMetric(display, keys, label) {
  for (const key of keys) {
    const metric = metricFromDisplay(display, key, label);
    if (metric) return metric;
  }
  return null;
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

function buildForecastWinRows(context) {
  const fromPayload = Array.isArray(context.fields?.metrics)
    ? context.fields.metrics.map(normalizeMetric).filter(Boolean)
    : [];
  if (fromPayload.length) return fromPayload;

  const display = context.fields?.display && typeof context.fields.display === 'object' ? context.fields.display : {};
  const rows = [
    firstDisplayMetric(display, ['goal_value', 'target', 'target_value'], 'Goal'),
    firstDisplayMetric(display, ['observed_to_date', 'actual_to_date', 'current_value'], 'Observed'),
    firstDisplayMetric(display, ['reached_on', 'closed_on', 'period_closed_on'], 'Reached on'),
    firstDisplayMetric(display, ['days_early', 'ahead_by', 'ahead_of_pace'], 'Ahead by'),
  ].filter(Boolean);
  return rows.length ? rows : buildForecastRows(context);
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
const DEFAULT_FOOTER_BRAND_NAME = 'headsupp.io';
const DEFAULT_FOOTER_BRAND_URL = 'https://headsupp.io';
const DEFAULT_POWERED_BY_NAME = 'headsupp.io';
const DEFAULT_POWERED_BY_URL = 'https://headsupp.io';
const HEADSUPP_SUCCESS_ICON_URLS = Object.freeze({
  trophy: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/ce7f99d4-1b03-403d-79a0-7e2084346100/public',
  award: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/df51dfa6-5392-46b6-9c01-1ddfae3f5600/public',
  medal: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/ec9d77a6-8193-4631-1f06-52698ad24b00/public',
  target: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/72fd0fa0-a91b-4ad4-fc9f-319d362cb500/public',
  target_hit: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/72fd0fa0-a91b-4ad4-fc9f-319d362cb500/public',
  trendup: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/38fbbbf5-7a77-4382-efef-26930f115100/public',
  trend_up: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/38fbbbf5-7a77-4382-efef-26930f115100/public',
  rocket: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/38fbbbf5-7a77-4382-efef-26930f115100/public',
});

function hasBrandingValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

function hasIntegratorBranding(branding = {}, config = {}) {
  return [
    branding.brand_name,
    branding.brand_url,
    branding.title,
    branding.subtitle,
    branding.logo_url,
    branding.footer_brand_name,
    branding.footer_brand_url,
    branding.footer_text,
    branding.company_line,
    branding.company_info,
    branding.icons,
    config.brand_name,
    config.brand_url,
    config.logo_url,
  ].some(hasBrandingValue);
}

function normalizeBranding(config = {}, defaults = {}) {
  const branding = config.branding && typeof config.branding === 'object' ? config.branding : {};
  const icons = branding.icons && typeof branding.icons === 'object' ? branding.icons : {};
  const integratorBranding = hasIntegratorBranding(branding, config);
  const footerBrandName = integratorBranding
    ? branding.footer_brand_name || branding.brand_name || config.brand_name || branding.title || null
    : defaults.footer_brand_name || DEFAULT_FOOTER_BRAND_NAME;
  const footerBrandUrl = integratorBranding
    ? branding.footer_brand_url || branding.brand_url || config.brand_url || null
    : defaults.footer_brand_url || DEFAULT_FOOTER_BRAND_URL;
  return {
    brand_name: branding.brand_name || branding.title || config.brand_name || (integratorBranding ? 'Alert' : 'Heads Up'),
    brand_url: safeUrl(branding.brand_url || config.brand_url || null),
    title: branding.title || branding.brand_name || config.brand_name || (integratorBranding ? null : 'Heads Up'),
    subtitle: branding.subtitle || null,
    logo_url: safeUrl(branding.logo_url || config.logo_url || (!integratorBranding ? defaults.logo_url : null)),
    accent_color: safeColor(branding.accent_color || config.accent_color),
    cta_variant: normalizeCtaVariant(branding.cta_variant || branding.cta_color_class || config.cta_variant || null),
    footer_text: integratorBranding
      ? branding.footer_text || null
      : defaults.footer_text || 'Fewer surprises. Just a heads up.',
    footer_brand_name: footerBrandName,
    footer_brand_url: safeUrl(footerBrandUrl),
    // In-card company line is the integrator's own legal line only. The platform
    // address belongs solely to the footer (platform_company_line) so it is not
    // duplicated for the non-integrator default.
    company_line: integratorBranding
      ? branding.company_line || branding.company_info || null
      : null,
    powered_by_name: defaults.powered_by_name || DEFAULT_POWERED_BY_NAME,
    powered_by_url: safeUrl(defaults.powered_by_url || DEFAULT_POWERED_BY_URL),
    show_powered_by: defaults.show_powered_by !== false,
    platform_company_line: defaults.company_line || DEFAULT_COMPANY_LINE,
    is_integrator_branding: integratorBranding,
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
    success: { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC', label: 'Success' },
    info: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD', label: 'Info' },
    recovered: { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC', label: 'Recovered' },
    recovery: { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC', label: 'Recovered' },
  };
  return styles[severity] || styles.warning;
}

function statusIcon(severity) {
  if (severity === 'critical') return { label: '!', bg: '#DC2626' };
  if (severity === 'success') return { label: 'WIN', bg: '#16A34A' };
  if (severity === 'info') return { label: 'i', bg: '#2563EB' };
  if (severity === 'recovered' || severity === 'recovery') return { label: 'OK', bg: '#16A34A' };
  return { label: '!', bg: '#F59E0B' };
}

function successIcon(variant) {
  const icons = {
    trophy: { label: 'WIN', bg: '#16A34A', title: 'Trophy' },
    medal: { label: '1st', bg: '#0F766E', title: 'Medal' },
    rocket: { label: 'GO', bg: '#2563EB', title: 'Rocket' },
    target_hit: { label: 'HIT', bg: '#15803D', title: 'Target hit' },
    target: { label: 'HIT', bg: '#15803D', title: 'Target hit' },
    check: { label: 'OK', bg: '#16A34A', title: 'Success' },
  };
  return icons[String(variant || '').trim().toLowerCase()] || icons.check;
}

function iconUrlForContext(context, brand) {
  const successIconUrl = context.hero_icon_variant ? HEADSUPP_SUCCESS_ICON_URLS[context.hero_icon_variant] : null;
  return safeUrl(
    context.notification?.icon_url
      || context.fields?.icon_url
      || context.fields?.email?.icon_url
      || successIconUrl
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
  const icon = context.hero_icon_variant ? successIcon(context.hero_icon_variant) : statusIcon(context.severity);
  const heroIconUrl = iconUrlForContext(context, brand);
  const actionLinks = Array.isArray(context.action_links) ? context.action_links : [];
  const actionTextLines = actionLinks.map((action) => `${action.label}: ${action.url}`);
  const ctaUrl = safeUrl(context.cta_url);
  const ctaVariant = normalizeCtaVariant(context.cta_variant || brand.cta_variant || 'dark');
  const ctaStyle = ctaVariantStyle(ctaVariant);
  const escapedBrand = escapeHtml(brand.brand_name);
  const headerTitle = brand.title ? escapeHtml(brand.title) : null;
  const headerSubtitle = brand.subtitle ? escapeHtml(brand.subtitle) : null;
  const contextLine = context.context_line ? escapeHtml(context.context_line) : null;
  const escapedRecipient = context.recipient_name ? escapeHtml(context.recipient_name) : null;
  const escapedTitle = escapeHtml(context.title);
  const escapedSummary = escapeHtml(context.summary);
  const escapedDetail = escapeHtml(context.detail || '');
  const headlineValue = context.headline_value ? escapeHtml(context.headline_value) : null;
  const headlineLabel = context.headline_label ? escapeHtml(context.headline_label) : null;
  const escapedFooter = brand.footer_text ? escapeHtml(brand.footer_text) : null;
  const footerBrandName = String(brand.footer_brand_name || '').trim();
  const footerBrandUrl = safeUrl(brand.footer_brand_url);
  const footerBrandHtml = footerBrandName
    ? footerBrandUrl
      ? `<a href="${escapeHtml(footerBrandUrl)}" style="color:#0969da;text-decoration:none;">${escapeHtml(footerBrandName)}</a>`
      : escapeHtml(footerBrandName)
    : null;
  const poweredByName = String(brand.powered_by_name || '').trim();
  const poweredByUrl = safeUrl(brand.powered_by_url);
  const poweredByHtml = brand.show_powered_by && poweredByName
    ? poweredByUrl
      ? `Powered by <a href="${escapeHtml(poweredByUrl)}" style="color:#0969da;text-decoration:none;">${escapeHtml(poweredByName)}</a>`
      : `Powered by ${escapeHtml(poweredByName)}`
    : null;
  const poweredByText = brand.show_powered_by && poweredByName ? `Powered by ${poweredByName}` : null;
  const companyLine = brand.company_line ? escapeHtml(brand.company_line) : null;
  const platformCompanyLine = brand.platform_company_line ? escapeHtml(brand.platform_company_line) : null;
  const metricsHtml = renderMetricsTable(metrics);
  const actionHtml = renderActionControls(actionLinks);
  const debugLine = context.debug?.line || null;
  const debugLineHtml = debugLine ? escapeHtml(debugLine) : null;
  const debugSubjectSuffix = context.debug?.subject_suffix || null;

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
    debugLine ? '' : null,
    debugLine,
    '',
    footerBrandName ? `From ${footerBrandName}` : null,
    brand.footer_text || null,
    brand.company_line || null,
    poweredByText,
    brand.platform_company_line || null,
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
    ? `<img src="${escapeHtml(heroIconUrl)}" width="128" height="128" alt="" style="display:block;border:0;border-radius:24px;margin:0 auto 18px auto;">`
    : `<div style="width:104px;height:104px;border-radius:24px;background:${icon.bg};color:#ffffff;font-size:42px;line-height:104px;text-align:center;font-weight:800;margin:0 auto 18px auto;">${icon.label}</div>`;
  const headlineHtml = headlineValue
    ? `<div style="margin:0 auto 14px auto;padding:14px 18px;border-radius:14px;background:#F0FDF4;border:1px solid #BBF7D0;max-width:360px;">
                        ${headlineLabel ? `<div style="margin:0 0 4px 0;font-size:12px;line-height:1.3;color:#15803D;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${headlineLabel}</div>` : ''}
                        <div style="font-size:34px;line-height:1.1;color:#14532D;font-weight:800;">${headlineValue}</div>
                      </div>`
    : '';

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
                      ${headlineHtml}
                      <p style="margin:0 auto 0 auto;max-width:440px;font-size:15px;line-height:1.55;color:#24292f;">${escapedSummary}</p>
                      ${context.detail ? `<p style="margin:10px auto 0 auto;max-width:440px;font-size:13px;line-height:1.55;color:#57606a;">${escapedDetail}</p>` : ''}
                      ${
                        ctaUrl
                          ? `<p style="margin:18px 0 0 0;"><a href="${escapeHtml(ctaUrl)}" data-cta-variant="${escapeHtml(ctaVariant)}" style="display:inline-block;min-width:148px;background:${ctaStyle.bg};color:${ctaStyle.text};text-align:center;text-decoration:none;padding:11px 18px;border:1px solid ${ctaStyle.border};border-radius:6px;font-size:14px;font-weight:700;">${escapeHtml(context.cta_label || 'View details')}</a></p>`
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
                      ${debugLineHtml ? `<p style="margin:0 0 12px 0;font-size:11px;line-height:1.5;color:#6e7781;">${debugLineHtml}</p>` : ''}
                      ${footerBrandHtml ? `<p style="margin:14px 0 0 0;font-size:12px;color:#57606a;">From ${footerBrandHtml}</p>` : ''}
                      ${escapedFooter ? `<p style="margin:${footerBrandHtml ? '6px' : '14px'} 0 0 0;font-size:12px;color:#57606a;">${escapedFooter}</p>` : ''}
                      ${companyLine ? `<p style="margin:${footerBrandHtml || escapedFooter ? '6px' : '14px'} 0 0 0;font-size:12px;color:#57606a;">${companyLine}</p>` : ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${
              poweredByHtml || platformCompanyLine
                ? `<tr><td align="center" style="padding:14px 10px 0 10px;font-size:11px;line-height:1.5;color:#6e7781;">
                    ${poweredByHtml ? `<div>${poweredByHtml}</div>` : ''}
                    ${platformCompanyLine ? `<div style="margin-top:4px;">${platformCompanyLine}</div>` : ''}
                  </td></tr>`
                : ''
            }
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: `${titlePrefix(context.severity)}: ${subjectTitle}${debugSubjectSuffix ? ` ${debugSubjectSuffix}` : ''}`,
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
      context_line:
        context.context_line ||
        firstDisplayName([context.fields?.forecast_name, context.fields?.resource_name, context.channel?.name]),
    },
    {
      metrics: buildMetricRows(context),
      subjectTitle: context.subject_title || context.title,
    },
  );
}

function renderForecastAlertTemplate(context) {
  const resourceName = firstDisplayName([
    context.fields?.forecast_name,
    context.fields?.goal_name,
    context.fields?.resource_name,
    context.channel?.name,
  ]);
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

function renderForecastWinTemplate(context) {
  const resourceName = firstDisplayName([
    context.fields?.forecast_name,
    context.fields?.goal_name,
    context.fields?.resource_name,
    context.channel?.name,
  ]);
  const title = context.notification?.title || resourceName || context.title;
  const contextLine = [
    context.branding?.brand_name || context.brand_name,
    resourceName && resourceName !== title ? resourceName : null,
  ].filter(Boolean).join(' - ');
  const headlineValue =
    context.notification?.headline_value
    || context.fields?.headline_value
    || context.fields?.display?.goal_value
    || context.fields?.display?.target
    || null;
  const headlineLabel =
    context.notification?.headline_label
    || context.fields?.headline_label
    || 'Milestone achieved';
  return renderBrandShell(
    {
      ...context,
      title,
      severity: context.severity === 'success' || context.severity === 'info' ? context.severity : 'success',
      context_line: context.context_line || contextLine,
      cta_label: context.cta_label || 'View forecast',
      cta_variant: context.cta_variant || 'success',
      headline_value: headlineValue,
      headline_label: headlineLabel,
      hero_icon_variant: context.notification?.icon_variant || context.fields?.icon_variant || 'check',
    },
    {
      metrics: buildForecastWinRows(context),
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
  forecast_win_v1: renderForecastWinTemplate,
  spend_alert_v1: renderSpendAlertTemplate,
});

function inferTemplateId({ subscriberConfig = {}, alert, fields = {}, templateRegistry = {} }) {
  const bySeverity = subscriberConfig.template_by_severity || {};
  const mapped = bySeverity[alert.severity];
  if (mapped && templateRegistry[mapped]) return mapped;
  if (fields?.email?.template_id && templateRegistry[fields.email.template_id]) return fields.email.template_id;
  if (fields?.tone === 'success' && templateRegistry.forecast_win_v1) return 'forecast_win_v1';
  if (fields?.template_kind === 'forecast_win' && templateRegistry.forecast_win_v1) return 'forecast_win_v1';
  const explicit = subscriberConfig.template_id;
  if (explicit && templateRegistry[explicit]) return explicit;
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
  const ctaVariant =
    payload?.cta?.variant
    || payload?.cta?.color_class
    || payload?.cta?.color
    || fields?.cta?.variant
    || fields?.cta?.color_class
    || subscriberConfig?.defaults?.cta_variant
    || subscriberConfig?.defaults?.cta_color_class
    || null;
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
  const debug = buildDebugContext(fields, subscriberConfig);
  const contextLine = firstDisplayName([
    fields.context_line,
    fields.forecast_name,
    fields.goal_name,
    fields.resource_name,
    channelMetadata.resource_name,
  ]);
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
    cta_variant: ctaVariant,
    unsubscribe_url,
    action_links,
    fields,
    channel,
    channel_metadata: channelMetadata,
    context_line: contextLine,
    debug,
    template_id: templateId,
    append_value_to_title: !notification.title && !titleTemplate,
  };

  return {
    template_id: templateId,
    action_ids: action_links.map((action) => action.id),
    ...renderer(context),
  };
}
