import { parseWatchJson } from '../watches/evaluate-watch.js';
import { persistAlertWithDeliveries } from '../alerts/persistence.js';
import { actionControlGate, loadActiveWatchActionControls } from '../watches/action-controls.js';
import { recordWatchEvaluationState } from '../watches/state.js';

function digestDue(config, state, now) {
  if (!state?.last_digest_at) return true;
  return Date.parse(now) >= Date.parse(nextDigestAt(state.last_digest_at, config.schedule));
}

function nextDigestAt(lastDigestAt, schedule = 'daily') {
  const date = new Date(lastDigestAt);
  if (schedule === 'hourly') date.setUTCHours(date.getUTCHours() + 1);
  else if (schedule === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else if (schedule === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function periodStart(now, schedule = 'daily') {
  const date = new Date(now);
  if (schedule === 'hourly') date.setUTCHours(date.getUTCHours() - 1);
  else if (schedule === 'weekly') date.setUTCDate(date.getUTCDate() - 7);
  else if (schedule === 'monthly') date.setUTCMonth(date.getUTCMonth() - 1);
  else date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString();
}

function configuredSignalIds(watch, config) {
  const ids = config.signal_ids || config.signals || [];
  const normalized = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (normalized.length > 0) return normalized;
  return watch.signal_id ? [watch.signal_id] : [];
}

async function loadDigestSummary(db, watch, config, now) {
  const signalIds = configuredSignalIds(watch, config);
  if (signalIds.length > 1 || config.period || ['weekly', 'monthly'].includes(config.schedule)) {
    const startAt = config.period?.start_at || periodStart(now, config.schedule);
    const endAt = config.period?.end_at || now;
    const result = await db
      .prepare(
        `SELECT signal_id,
          COALESCE(SUM(sum_value), 0) AS sum_value,
          COALESCE(SUM(count_value), 0) AS count_value,
          CASE WHEN COALESCE(SUM(count_value), 0) > 0 THEN COALESCE(SUM(sum_value), 0) / SUM(count_value) ELSE NULL END AS avg_value,
          MIN(min_value) AS min_value,
          MAX(max_value) AS max_value,
          MAX(last_value) AS last_value
         FROM aggregates
         WHERE signal_id IN (${signalIds.map(() => '?').join(', ')})
           AND bucket_start_at >= ? AND bucket_start_at <= ?
         GROUP BY signal_id
         ORDER BY signal_id`,
      )
      .bind(...signalIds, startAt, endAt)
      .all();
    return {
      period: { schedule: config.schedule || 'daily', start_at: startAt, end_at: endAt },
      rows: result?.results || [],
    };
  }

  const aggregate = await db
    .prepare('SELECT * FROM aggregates WHERE signal_id = ? ORDER BY bucket_start_at DESC LIMIT 1')
    .bind(watch.signal_id)
    .first();
  return {
    period: null,
    rows: aggregate ? [aggregate] : [],
    latest: aggregate || null,
  };
}

export async function loadDigestWatches(db) {
  const result = await db.prepare("SELECT * FROM watches WHERE watch_type = 'DIGEST' AND enabled = 1").all();
  return result?.results || [];
}

export async function evaluateDigestWatch({ db, queue = null, watch, now = new Date().toISOString() }) {
  const config = parseWatchJson(watch.config_json);
  const [state, actionControls] = await Promise.all([
    db.prepare('SELECT * FROM watch_states WHERE watch_id = ? LIMIT 1').bind(watch.id).first(),
    loadActiveWatchActionControls(db, watch, now),
  ]);
  const gate = actionControlGate(actionControls, now);
  if (gate.blocked) {
    await recordWatchEvaluationState({
      db,
      watch,
      evaluation: { supported: true, triggered: false, current_value: null },
      decision: { action: 'none', reason: gate.reason },
      now,
    });
    return { triggered: false, reason: gate.reason };
  }
  if (!digestDue(config, state, now)) {
    await recordWatchEvaluationState({
      db,
      watch,
      evaluation: { supported: true, triggered: false, current_value: null },
      decision: { action: 'none', reason: 'DIGEST_NOT_DUE' },
      now,
    });
    return { triggered: false, reason: 'DIGEST_NOT_DUE' };
  }

  const summary = await loadDigestSummary(db, watch, config, now);
  const aggregate = summary.latest || summary.rows[0] || null;
  const currentValue = aggregate?.last_value ?? null;
  const evaluation = {
    supported: true,
    triggered: true,
    current_value: currentValue,
    threshold: null,
    severity: config.severity || 'info',
    fields: {
      schedule: config.schedule || 'daily',
      period: summary.period,
      signals: summary.rows.map((row) => ({
        signal_id: row.signal_id,
        sum: Number(row.sum_value || 0),
        count: Number(row.count_value || 0),
        avg: row.avg_value === null || row.avg_value === undefined ? null : Number(row.avg_value),
        min: row.min_value === null || row.min_value === undefined ? null : Number(row.min_value),
        max: row.max_value === null || row.max_value === undefined ? null : Number(row.max_value),
        last: row.last_value === null || row.last_value === undefined ? null : Number(row.last_value),
      })),
    },
  };
  const decision = { action: 'alert', severity: evaluation.severity, current_value: currentValue };
  const persisted = await persistAlertWithDeliveries({
    db,
    queue,
    watch: { ...watch, name: watch.name || 'Digest' },
    evaluation,
    decision,
    input: {
      signalId: watch.signal_id,
      bucketType: aggregate?.bucket_type || 'digest',
      bucketStartAt: aggregate?.bucket_start_at || now,
    },
    now,
  });

  await db
    .prepare(
      `INSERT INTO watch_states (watch_id, last_status, last_evaluated_at, last_digest_at, state_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(watch_id)
       DO UPDATE SET last_status = excluded.last_status,
         last_evaluated_at = excluded.last_evaluated_at,
         last_digest_at = excluded.last_digest_at,
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`,
    )
    .bind(watch.id, 'digest', now, now, JSON.stringify({ include: config.include || [], summary: evaluation.fields }), now)
    .run();

  return {
    triggered: true,
    alert: persisted.alert,
    deliveries: persisted.deliveries,
    enqueued_deliveries: persisted.enqueued_deliveries,
  };
}

export async function evaluateDigestWatches({ db, queue = null, now = new Date().toISOString() }) {
  const watches = await loadDigestWatches(db);
  let triggered = 0;
  let enqueuedDeliveries = 0;
  for (const watch of watches) {
    const result = await evaluateDigestWatch({ db, queue, watch, now });
    if (result.triggered) triggered += 1;
    enqueuedDeliveries += Number(result.enqueued_deliveries || 0);
  }
  return { watches: watches.length, triggered, enqueued_deliveries: enqueuedDeliveries };
}
