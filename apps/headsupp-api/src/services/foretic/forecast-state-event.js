import { signConnectorPayload } from '../connectors/hmac.js';
import { FORETIC_FORECAST_SIGNAL_KEY } from './forecast-watch-defaults.js';

export function forecastStatusFromPace(pacePercent) {
  if (pacePercent < 70) return 'critical';
  if (pacePercent < 85) return 'warning';
  if (pacePercent > 95) return 'recovered';
  return 'ok';
}

function formatMoney(value, { currency = 'USD', locale = 'en-US' } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(number);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
}

export function buildForeticForecastStateEvent({
  forecastId,
  forecastName,
  pacePercent,
  actualToDate = null,
  expectedToDate = null,
  target = null,
  daysRemaining = null,
  primaryDriver = null,
  currency = 'USD',
  locale = 'en-US',
  display = {},
  notification = {},
  metrics = null,
  occurredAt,
  ctaUrl,
  idempotencyKey,
}) {
  const occurred = new Date(occurredAt || Date.now()).toISOString();
  const actualDisplay = display.actual_to_date || formatMoney(actualToDate, { currency, locale });
  const expectedDisplay = display.expected_to_date || formatMoney(expectedToDate, { currency, locale });
  const targetDisplay = display.target || formatMoney(target, { currency, locale });
  const paceDisplay = display.pace_percent || display.current_value || formatPercent(pacePercent);
  const thresholdDisplay = display.threshold_value || '85%';
  const daysDisplay = display.days_remaining || (daysRemaining === null ? null : `${daysRemaining} days`);
  const gapValue = Number(expectedToDate) - Number(actualToDate);
  const gapDisplay = display.gap || (Number.isFinite(gapValue) && gapValue > 0
    ? `${formatMoney(gapValue, { currency, locale })} behind expected pace`
    : null);
  const richMetrics = Array.isArray(metrics)
    ? metrics
    : [
        actualDisplay ? { label: 'Actual to date', value: actualDisplay } : null,
        targetDisplay ? { label: 'Target', value: targetDisplay } : null,
        gapDisplay ? { label: 'Gap', value: gapDisplay } : null,
        daysDisplay ? { label: 'Time left', value: daysDisplay } : null,
        paceDisplay ? { label: 'Pace', value: paceDisplay, subline: `Threshold ${thresholdDisplay}` } : null,
      ].filter(Boolean);
  const summary = notification.summary
    || (gapDisplay && daysDisplay ? `${forecastName} is ${gapDisplay} with ${daysDisplay} left.` : null)
    || `${forecastName} forecast pace is ${paceDisplay}.`;

  return {
    idempotency_key: idempotencyKey || `foretic:${forecastId}:forecast_state:${occurred}`,
    signal_key: FORETIC_FORECAST_SIGNAL_KEY,
    occurred_at: occurred,
    value: {
      num: pacePercent,
    },
    fields: {
      event_type: 'forecast_state',
      forecast_id: forecastId,
      forecast_name: forecastName,
      pace_percent: pacePercent,
      status: forecastStatusFromPace(pacePercent),
      actual_to_date: actualToDate,
      expected_to_date: expectedToDate,
      target,
      days_remaining: daysRemaining,
      primary_driver: primaryDriver,
      display: compactObject({
        current_value: paceDisplay,
        threshold_value: thresholdDisplay,
        pace_percent: paceDisplay,
        actual_to_date: actualDisplay,
        expected_to_date: expectedDisplay,
        target: targetDisplay,
        gap: gapDisplay,
        days_remaining: daysDisplay,
      }),
      metrics: richMetrics,
      notification: compactObject({
        title: notification.title || forecastName,
        summary,
        detail: notification.detail || (primaryDriver ? `Largest visible driver: ${primaryDriver}.` : null),
      }),
    },
    cta: ctaUrl
      ? {
          label: 'View forecast',
          url: ctaUrl,
          kind: 'review',
        }
      : null,
  };
}

export async function buildSignedForeticIngestRequest({
  eventUrl,
  connectorSecret,
  event,
  timestamp = new Date().toISOString(),
}) {
  const rawBody = JSON.stringify(event);
  return {
    url: eventUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HeadsUp-Timestamp': timestamp,
      'X-HeadsUp-Signature': await signConnectorPayload({
        secret: connectorSecret,
        timestamp,
        rawBody,
      }),
    },
    body: rawBody,
  };
}
