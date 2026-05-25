import { classifyDeliveryResult } from './backoff.js';
import { buildSignedWebhookHeaders } from './signing.js';

export function quietSummaryWebhookPayload(delivery) {
  const payload = typeof delivery.payload_json === 'string' ? JSON.parse(delivery.payload_json) : delivery.payload_json;
  return payload;
}

export function quietSummarySlackPayload(delivery) {
  const payload = quietSummaryWebhookPayload(delivery);
  const count = payload.watches?.length || 0;
  return {
    text: `Heads Up quiet summary: ${payload.channel_name || payload.channel_id} has ${count} watched item${count === 1 ? '' : 's'} quiet as of ${payload.generated_at}.`,
  };
}

export function quietSummaryDeliveryPayload(delivery, subscriber) {
  if (subscriber.subscriber_type === 'slack_webhook') return quietSummarySlackPayload(delivery);
  return quietSummaryWebhookPayload(delivery);
}

export async function updateQuietSummaryDeliveryState(db, deliveryId, state, responseBody = null) {
  await db
    .prepare(
      `UPDATE quiet_summary_deliveries
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

export async function dispatchQuietSummaryDelivery({
  db,
  delivery,
  subscriber,
  env = {},
  fetchFn = fetch,
  now = new Date().toISOString(),
}) {
  let responseStatus = null;
  let responseBody = null;
  let error = null;
  try {
    const body = JSON.stringify(quietSummaryDeliveryPayload(delivery, subscriber));
    const signedHeaders = await buildSignedWebhookHeaders({
      body,
      deliveryId: delivery.id,
      subscriber,
      env,
      timestamp: Math.floor(Date.parse(now) / 1000),
    });
    const response = await fetchFn(delivery.destination_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signedHeaders,
      },
      body,
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
  await updateQuietSummaryDeliveryState(db, delivery.id, state, responseBody);
  return { ...state, error: error?.message || null };
}

export async function loadQuietSummaryDeliveryBundle(db, deliveryId) {
  const delivery = await db.prepare('SELECT * FROM quiet_summary_deliveries WHERE id = ? LIMIT 1').bind(deliveryId).first();
  if (!delivery) return null;
  const subscriber = await db.prepare('SELECT * FROM subscribers WHERE id = ? OR subscriber_id = ? LIMIT 1').bind(
    delivery.subscriber_id,
    delivery.subscriber_id,
  ).first();
  return { delivery, subscriber };
}

export async function processQuietSummaryDeliveryMessage(message, env, options = {}) {
  const deliveryId = message.quietSummaryDeliveryId || message.deliveryId;
  const bundle = await loadQuietSummaryDeliveryBundle(env.DB, deliveryId);
  if (!bundle) {
    return { processed: false, reason: 'QUIET_SUMMARY_DELIVERY_NOT_FOUND' };
  }
  if (!bundle.subscriber) {
    return { processed: false, reason: 'QUIET_SUMMARY_SUBSCRIBER_NOT_FOUND' };
  }
  const result = await dispatchQuietSummaryDelivery({
    db: env.DB,
    delivery: bundle.delivery,
    subscriber: bundle.subscriber,
    env,
    fetchFn: options.fetchFn,
    now: options.now,
  });
  return { processed: true, result };
}
