import { stableId } from '../ids/stable-id.js';
import { cooldownUntil } from '../watches/alert-decision.js';

export function buildAlert({ watch, evaluation, decision, input, now = new Date().toISOString() }) {
  const alertId = stableId('alert', `${watch.id || watch.watch_id}:${decision.action}:${now}`);
  const payload = {
    watch_id: watch.id || watch.watch_id,
    signal_id: watch.signal_id || input.signalId,
    bucket_type: input.bucketType,
    bucket_start_at: input.bucketStartAt,
    current_value: decision.current_value,
    threshold: evaluation.threshold,
    cta: evaluation.cta || null,
    fields: evaluation.fields || {},
  };

  return {
    id: alertId,
    workspace_id: watch.workspace_id,
    channel_id: watch.channel_id,
    signal_id: watch.signal_id || input.signalId,
    watch_id: watch.id || watch.watch_id,
    severity: decision.severity,
    current_value: decision.current_value,
    threshold_value: evaluation.threshold,
    summary_text: `${watch.name || 'Watch'} is ${decision.severity} at ${decision.current_value}.`,
    payload_json: JSON.stringify(payload),
    cta_label: payload.cta?.label || null,
    cta_url: payload.cta?.url || null,
    triggered_at: now,
    created_at: now,
  };
}

export async function loadAlertSubscribers(db, { workspaceId, channelId }) {
  const result = await db
    .prepare(
      `SELECT *
       FROM subscribers
       WHERE enabled = 1
         AND mode = 'alert'
         AND (
           (COALESCE(subscriber_scope, 'channel') = 'channel' AND channel_id = ?)
           OR
           (subscriber_scope = 'workspace' AND workspace_id = ?)
         )`,
    )
    .bind(channelId, workspaceId)
    .all();

  return result?.results || [];
}

export function buildAlertDeliveries({ alert, subscribers, now = new Date().toISOString() }) {
  return subscribers.map((subscriber) => ({
    id: stableId('delivery', `${alert.id}:${subscriber.id || subscriber.subscriber_id}`),
    alert_id: alert.id,
    subscriber_id: subscriber.id || subscriber.subscriber_id,
    destination_url: subscriber.destination_url,
    status: 'pending',
    attempt_count: 0,
    last_attempt_at: null,
    next_retry_at: now,
    response_code: null,
    response_body: null,
    created_at: now,
    updated_at: now,
  }));
}

export async function enqueueAlertDeliveries(queue, deliveries) {
  if (!queue?.sendBatch || deliveries.length === 0) return 0;

  await queue.sendBatch(
    deliveries.map((delivery) => ({
      body: {
        alertDeliveryId: delivery.id,
      },
    })),
  );
  return deliveries.length;
}

function alertStatement(db, alert) {
  return db
    .prepare(
      `INSERT INTO alerts (
        id, workspace_id, channel_id, signal_id, watch_id, severity, current_value, threshold_value,
        summary_text, payload_json, cta_label, cta_url, triggered_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      alert.id,
      alert.workspace_id,
      alert.channel_id,
      alert.signal_id,
      alert.watch_id,
      alert.severity,
      alert.current_value,
      alert.threshold_value,
      alert.summary_text,
      alert.payload_json,
      alert.cta_label,
      alert.cta_url,
      alert.triggered_at,
      alert.created_at,
    );
}

function watchStateStatement(db, { watch, decision, now }) {
  const cooldown = decision.action === 'recovery' ? null : cooldownUntil(now, watch.cooldown_seconds ?? 86400);
  return db
    .prepare(
      `INSERT INTO watch_states (
        watch_id, last_status, last_evaluated_at, last_alert_at, last_alert_value, last_alert_severity, cooldown_until,
        last_recovery_at, state_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(watch_id)
      DO UPDATE SET
        last_status = excluded.last_status,
        last_evaluated_at = excluded.last_evaluated_at,
        last_alert_at = excluded.last_alert_at,
        last_alert_value = excluded.last_alert_value,
        last_alert_severity = excluded.last_alert_severity,
        cooldown_until = excluded.cooldown_until,
        last_recovery_at = excluded.last_recovery_at,
        state_json = excluded.state_json,
        updated_at = excluded.updated_at`,
    )
    .bind(
      watch.id || watch.watch_id,
      decision.action === 'recovery' ? 'recovered' : 'triggered',
      now,
      now,
      decision.current_value,
      decision.severity,
      cooldown,
      decision.action === 'recovery' ? now : null,
      JSON.stringify({ action: decision.action, current_value: decision.current_value }),
      now,
    );
}

function deliveryStatement(db, delivery) {
  return db
    .prepare(
      `INSERT INTO alert_deliveries (
        id, alert_id, subscriber_id, destination_url, status, attempt_count, last_attempt_at,
        next_retry_at, response_code, response_body, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      delivery.id,
      delivery.alert_id,
      delivery.subscriber_id,
      delivery.destination_url,
      delivery.status,
      delivery.attempt_count,
      delivery.last_attempt_at,
      delivery.next_retry_at,
      delivery.response_code,
      delivery.response_body,
      delivery.created_at,
      delivery.updated_at,
    );
}

export async function persistAlertWithDeliveries({
  db,
  queue = null,
  watch,
  evaluation,
  decision,
  input,
  now = new Date().toISOString(),
}) {
  const alert = buildAlert({ watch, evaluation, decision, input, now });
  const subscribers = await loadAlertSubscribers(db, { workspaceId: alert.workspace_id, channelId: alert.channel_id });
  const deliveries = buildAlertDeliveries({ alert, subscribers, now });
  const statements = [alertStatement(db, alert), watchStateStatement(db, { watch, decision, now })];
  statements.push(...deliveries.map((delivery) => deliveryStatement(db, delivery)));
  await db.batch(statements);
  const enqueued_deliveries = await enqueueAlertDeliveries(queue, deliveries);

  return {
    alert,
    deliveries,
    enqueued_deliveries,
  };
}
