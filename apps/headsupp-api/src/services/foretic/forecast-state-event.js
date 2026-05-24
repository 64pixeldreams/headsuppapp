import { signConnectorPayload } from '../connectors/hmac.js';
import { FORETIC_FORECAST_SIGNAL_KEY } from './forecast-watch-defaults.js';

export function forecastStatusFromPace(pacePercent) {
  if (pacePercent < 70) return 'critical';
  if (pacePercent < 85) return 'warning';
  if (pacePercent > 95) return 'recovered';
  return 'ok';
}

export function buildForeticForecastStateEvent({
  forecastId,
  forecastName,
  pacePercent,
  occurredAt,
  ctaUrl,
  idempotencyKey,
}) {
  const occurred = new Date(occurredAt || Date.now()).toISOString();
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
