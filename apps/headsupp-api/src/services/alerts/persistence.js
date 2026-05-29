import { subscriberMatchesAlertFilters } from '../subscribers/alert-filters.js';
import { cooldownUntil } from '../watches/alert-decision.js';

const SEVERITY_RANK = Object.freeze({
  recovery: 50,
  info: 100,
  watch: 100,
  warning: 200,
  critical: 300,
  success: 300,
});

function shortHash(value) {
  let hash = 5381;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function compactStableId(prefix, parts) {
  const seed = parts.filter((part) => part !== undefined && part !== null).join(':');
  const normalized = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 52);
  return `${prefix}_${normalized}_${shortHash(seed)}`;
}

function severityRank(severity) {
  return SEVERITY_RANK[String(severity || '').toLowerCase()] ?? 0;
}

function normalizeFingerprintPart(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function resourceIdentity(payload = {}, alert = {}) {
  const fields = payload.fields || {};
  return (
    fields.resource_id ||
    fields.forecast_id ||
    fields.job_id ||
    fields.external_resource_id ||
    payload.dimensions_hash ||
    fields.dimensions_hash ||
    alert.channel_id
  );
}

function normalizeWatchPurpose(watchId) {
  const parts = String(watchId || '').split(':').filter(Boolean);
  const last = parts[parts.length - 1];
  const previous = parts[parts.length - 2];
  if (['warning', 'critical', 'info', 'ahead', 'success'].includes(last) && previous) return previous;
  return String(watchId || '').replace(/(?:^|[_:-])(warning|critical|info|ahead|success)$/i, '');
}

export function attentionFingerprint({ alert, subscriber, payload = parseAlertPayload(alert) }) {
  const fields = payload.fields || {};
  const family =
    fields.watch_group?.watch_group_key ||
    payload.watch_group_key ||
    fields.attention_family ||
    payload.attention_family ||
    normalizeWatchPurpose(payload.watch_id || alert.watch_id);
  return [
    subscriber.id || subscriber.subscriber_id,
    alert.workspace_id,
    alert.channel_id,
    alert.signal_id || payload.signal_id,
    resourceIdentity(payload, alert),
    family,
    payload.bucket_type || 'event',
    payload.bucket_start_at || alert.triggered_at,
  ].map(normalizeFingerprintPart).join('|');
}

export function buildAlert({ watch, evaluation, decision, input, now = new Date().toISOString() }) {
  const alertId = compactStableId('alert', [now, decision.action, watch.id || watch.watch_id, decision.occurrence_key || evaluation.occurrence_key]);
  const payload = {
    watch_id: watch.id || watch.watch_id,
    signal_id: watch.signal_id || input.signalId,
    watch_group_id: input.watchGroupId || watch.watch_group_id || null,
    band_key: watch.band_key || null,
    bucket_type: input.bucketType,
    bucket_start_at: input.bucketStartAt,
    current_value: decision.current_value,
    threshold: evaluation.threshold,
    occurrence_key: decision.occurrence_key || evaluation.occurrence_key || null,
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
    summary_text: evaluation.summary_text || `${watch.name || 'Watch'} is ${decision.severity} at ${decision.current_value}.`,
    payload_json: JSON.stringify(payload),
    cta_label: payload.cta?.label || null,
    cta_url: payload.cta?.url || null,
    triggered_at: now,
    created_at: now,
  };
}

function parseAlertPayload(alert) {
  if (!alert?.payload_json) return {};
  try {
    return JSON.parse(alert.payload_json);
  } catch {
    return {};
  }
}

async function firstRow(db, sql, params = []) {
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.first === 'function') return prepared.first();
  return null;
}

export async function loadAlertRoutingContext(db, alert) {
  if (!alert) return {};
  const payload = parseAlertPayload(alert);
  const signal = await firstRow(
    db,
    'SELECT signal_key FROM signals WHERE id = ? OR signal_id = ? LIMIT 1',
    [alert.signal_id, alert.signal_id],
  );
  const watch = await firstRow(
    db,
    'SELECT id, watch_id, watch_group_id, band_key FROM watches WHERE id = ? OR watch_id = ? LIMIT 1',
    [alert.watch_id, alert.watch_id],
  );
  const watchGroupId = payload.watch_group_id || watch?.watch_group_id || null;
  const watchGroup = watchGroupId
    ? await firstRow(
      db,
      'SELECT id, watch_group_id, group_key FROM watch_groups WHERE id = ? OR watch_group_id = ? LIMIT 1',
      [watchGroupId, watchGroupId],
    )
    : null;
  return {
    signal_id: alert.signal_id || payload.signal_id || null,
    signal_key: signal?.signal_key || payload.signal_key || null,
    watch_id: alert.watch_id || payload.watch_id || null,
    watch_key: watch?.watch_id || payload.watch_key || null,
    watch_group_id: watchGroupId,
    watch_group_key: watchGroup?.group_key || payload.watch_group_key || payload.fields?.watch_group?.watch_group_key || null,
    band_key: payload.band_key || watch?.band_key || payload.fields?.watch_group?.band_key || null,
    severity: alert.severity || null,
    fields: payload.fields || {},
  };
}

export async function loadAlertSubscribers(db, { workspaceId, channelId, alert = null }) {
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

  const subscribers = result?.results || [];
  if (!alert) return subscribers;
  const context = await loadAlertRoutingContext(db, alert);
  return subscribers.filter((subscriber) => subscriberMatchesAlertFilters(subscriber, context));
}

export function buildAlertDeliveries({ alert, subscribers, now = new Date().toISOString() }) {
  return subscribers.map((subscriber) => ({
    id: compactStableId('delivery', [alert.id, subscriber.id || subscriber.subscriber_id]),
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

async function loadAttentionCandidates(db, { alert, subscriber, payload }) {
  const result = await db
    .prepare(
      `SELECT d.id AS delivery_id, d.status AS delivery_status, d.subscriber_id,
              a.id AS alert_id, a.workspace_id, a.channel_id, a.signal_id, a.watch_id,
              a.severity, a.triggered_at, a.created_at, a.payload_json
       FROM alert_deliveries d
       JOIN alerts a ON a.id = d.alert_id
       WHERE d.subscriber_id = ?
         AND a.workspace_id = ?
         AND a.channel_id = ?
         AND a.signal_id = ?
         AND a.id <> ?
         AND d.status IN ('pending', 'retrying', 'sent')
         AND a.created_at >= ?
       ORDER BY a.created_at DESC
       LIMIT 25`,
    )
    .bind(
      subscriber.id || subscriber.subscriber_id,
      alert.workspace_id,
      alert.channel_id,
      alert.signal_id,
      alert.id,
      payload.bucket_start_at || alert.triggered_at,
    )
    .all();
  return result?.results || [];
}

function asCandidateAlert(candidate) {
  return {
    id: candidate.alert_id,
    workspace_id: candidate.workspace_id,
    channel_id: candidate.channel_id,
    signal_id: candidate.signal_id,
    watch_id: candidate.watch_id,
    severity: candidate.severity,
    triggered_at: candidate.triggered_at,
    created_at: candidate.created_at,
    payload_json: candidate.payload_json,
  };
}

async function markDeliverySuppressed(db, { deliveryId, fingerprint, winnerAlertId, now }) {
  await db
    .prepare(
      `UPDATE alert_deliveries
       SET status = ?, response_body = ?, updated_at = ?
       WHERE id = ? AND status IN ('pending', 'retrying')`,
    )
    .bind(
      'suppressed_duplicate',
      JSON.stringify({ reason: 'ATTENTION_DUPLICATE_SUPPRESSED', attention_fingerprint: fingerprint, winner_alert_id: winnerAlertId }),
      now,
      deliveryId,
    )
    .run();
}

async function applyAttentionSuppression(db, { alert, deliveries, subscribers, now }) {
  const payload = parseAlertPayload(alert);
  const suppressed = [];
  const deliverable = [];
  for (const delivery of deliveries) {
    const subscriber = subscribers.find((item) => (item.id || item.subscriber_id) === delivery.subscriber_id);
    if (!subscriber) {
      deliverable.push(delivery);
      continue;
    }
    const fingerprint = attentionFingerprint({ alert, subscriber, payload });
    const candidates = await loadAttentionCandidates(db, { alert, subscriber, payload });
    const duplicate = candidates.find((candidate) => {
      const candidateAlert = asCandidateAlert(candidate);
      return attentionFingerprint({ alert: candidateAlert, subscriber }) === fingerprint;
    });
    if (!duplicate) {
      deliverable.push(delivery);
      continue;
    }
    const existingRank = severityRank(duplicate.severity);
    const currentRank = severityRank(alert.severity);
    if (existingRank >= currentRank) {
      delivery.status = 'suppressed_duplicate';
      delivery.next_retry_at = null;
      delivery.response_body = JSON.stringify({
        reason: 'ATTENTION_DUPLICATE_SUPPRESSED',
        attention_fingerprint: fingerprint,
        winner_alert_id: duplicate.alert_id,
      });
      suppressed.push(delivery);
      continue;
    }
    if (['pending', 'retrying'].includes(duplicate.delivery_status)) {
      await markDeliverySuppressed(db, { deliveryId: duplicate.delivery_id, fingerprint, winnerAlertId: alert.id, now });
    }
    deliverable.push(delivery);
  }
  return { deliverable, suppressed };
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
  const subscribers = await loadAlertSubscribers(db, { workspaceId: alert.workspace_id, channelId: alert.channel_id, alert });
  const deliveries = buildAlertDeliveries({ alert, subscribers, now });
  const { deliverable, suppressed } = await applyAttentionSuppression(db, { alert, deliveries, subscribers, now });
  const statements = [alertStatement(db, alert), watchStateStatement(db, { watch, decision, now })];
  statements.push(...deliveries.map((delivery) => deliveryStatement(db, delivery)));
  await db.batch(statements);
  const enqueued_deliveries = await enqueueAlertDeliveries(queue, deliverable);

  return {
    alert,
    deliveries,
    suppressed_deliveries: suppressed,
    enqueued_deliveries,
  };
}
