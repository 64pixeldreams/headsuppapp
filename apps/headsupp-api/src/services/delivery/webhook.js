import { classifyDeliveryResult } from './backoff.js';
import { buildSignedWebhookHeaders } from './signing.js';
import { slackAlertPayload as renderSlackAlertPayload } from './slack-alert.js';

function parseChannelMetadata(channel) {
  if (!channel) return {};
  if (channel.metadata && typeof channel.metadata === 'object' && !Array.isArray(channel.metadata)) return channel.metadata;
  try {
    return channel.metadata_json ? JSON.parse(channel.metadata_json) : {};
  } catch {
    return {};
  }
}

export function genericAlertPayload(alert, channel = null) {
  let payload = {};
  try {
    payload = alert.payload_json ? JSON.parse(alert.payload_json) : {};
  } catch {
    payload = {};
  }
  return {
    type: 'heads_up.alert',
    schema_version: '2026-05-28',
    alert_id: alert.id,
    workspace_id: alert.workspace_id,
    channel_id: alert.channel_id,
    signal_id: alert.signal_id,
    watch_id: alert.watch_id,
    severity: alert.severity,
    summary: alert.summary_text,
    current_value: alert.current_value,
    threshold_value: alert.threshold_value,
    triggered_at: alert.triggered_at,
    channel_metadata: parseChannelMetadata(channel),
    fields: payload.fields || {},
    cta: alert.cta_url
      ? {
          label: alert.cta_label,
          url: alert.cta_url,
        }
      : null,
  };
}

export function slackAlertPayload(alert, options = {}) {
  return renderSlackAlertPayload(alert, options);
}

export function alertDeliveryPayload(alert, subscriber, channel = null) {
  if (subscriber.subscriber_type === 'slack_webhook') {
    return renderSlackAlertPayload(alert, {
      subscriber,
      channelMetadata: parseChannelMetadata(channel),
    });
  }
  return genericAlertPayload(alert, channel);
}

function smokeStatusResponse(destinationUrl, subscriber, env = {}) {
  if (env.HEADSUPP_SMOKE_TRANSPORT_ENABLED !== 'true') return null;
  if (subscriber?.source_app !== 'headsupp-smoke') return null;
  const match = String(destinationUrl || '').match(/^smoke:\/\/status\/(\d{3})$/);
  if (!match) return null;
  const status = Number(match[1]);
  if (!Number.isInteger(status) || status < 100 || status > 599) return null;
  return new Response(`smoke status ${status}`, { status });
}

export async function updateAlertDeliveryState(db, deliveryId, state, responseBody = null) {
  await db
    .prepare(
      `UPDATE alert_deliveries
       SET status = ?, attempt_count = ?, last_attempt_at = ?, next_retry_at = ?,
           response_code = ?, response_body = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      state.status,
      state.attempt_count,
      state.last_attempt_at,
      state.next_retry_at,
      state.response_code,
      responseBody,
      state.last_attempt_at,
      deliveryId,
    )
    .run();
}

export async function dispatchAlertDelivery({
  db,
  delivery,
  alert,
  subscriber,
  channel,
  env = {},
  fetchFn = fetch,
  now = new Date().toISOString(),
}) {
  let responseStatus = null;
  let responseBody = null;
  let error = null;

  try {
    const body = JSON.stringify(alertDeliveryPayload(alert, subscriber, channel));
    const signedHeaders = await buildSignedWebhookHeaders({
      body,
      deliveryId: delivery.id,
      subscriber,
      env,
      timestamp: Math.floor(Date.parse(now) / 1000),
    });
    const response =
      smokeStatusResponse(delivery.destination_url, subscriber, env) ||
      (await fetchFn(delivery.destination_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...signedHeaders,
        },
        body,
      }));
    responseStatus = response.status;
    responseBody = await response.text();
  } catch (caught) {
    error = caught;
    responseBody = caught?.message || 'Network error';
  }

  const state = classifyDeliveryResult({
    responseStatus,
    error,
    previousAttemptCount: delivery.attempt_count || 0,
    now,
  });
  await updateAlertDeliveryState(db, delivery.id, state, responseBody);

  return {
    ...state,
    error: error?.message || null,
  };
}
