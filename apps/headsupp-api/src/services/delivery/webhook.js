import { classifyDeliveryResult } from './backoff.js';

export function genericAlertPayload(alert) {
  return {
    type: 'heads_up.alert',
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
    cta: alert.cta_url
      ? {
          label: alert.cta_label,
          url: alert.cta_url,
        }
      : null,
  };
}

export function slackAlertPayload(alert) {
  const cta = alert.cta_url ? ` ${alert.cta_label || 'View'}: ${alert.cta_url}` : '';
  return {
    text: `${alert.summary_text}${cta}`,
  };
}

export function alertDeliveryPayload(alert, subscriber) {
  if (subscriber.subscriber_type === 'slack_webhook') return slackAlertPayload(alert);
  return genericAlertPayload(alert);
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
  fetchFn = fetch,
  now = new Date().toISOString(),
}) {
  let responseStatus = null;
  let responseBody = null;
  let error = null;

  try {
    const response = await fetchFn(delivery.destination_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertDeliveryPayload(alert, subscriber)),
    });
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
