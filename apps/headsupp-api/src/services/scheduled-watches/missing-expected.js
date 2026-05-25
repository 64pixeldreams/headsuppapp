import { parseWatchJson } from '../watches/evaluate-watch.js';
import { decideAlertAction } from '../watches/alert-decision.js';
import { loadActiveWatchActionControls } from '../watches/action-controls.js';
import { recordWatchEvaluationState } from '../watches/state.js';
import { persistAlertWithDeliveries } from '../alerts/persistence.js';
import { dimensionsHash } from '../aggregation/buckets.js';

function windowStart(now, expectedEvery = {}) {
  const date = new Date(now);
  const count = Number(expectedEvery.count || 1);
  const unit = expectedEvery.unit || 'day';
  if (unit === 'hour') date.setUTCHours(date.getUTCHours() - count);
  else if (unit === 'minute') date.setUTCMinutes(date.getUTCMinutes() - count);
  else date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString();
}

export async function loadMissingExpectedWatches(db) {
  const result = await db
    .prepare("SELECT * FROM watches WHERE watch_type = 'MISSING_EXPECTED' AND enabled = 1")
    .all();
  return result?.results || [];
}

export async function evaluateMissingExpectedWatch({ db, watch, now = new Date().toISOString() }) {
  const config = parseWatchJson(watch.config_json);
  const graceMs = Number(config.grace_seconds || 0) * 1000;
  const checkNow = new Date(Date.parse(now) - graceMs).toISOString();
  const startAt = windowStart(checkNow, config.expected_every);
  const minimumCount = Number(config.minimum_count || 1);
  const bucketType = config.bucket_type || 'day';
  const configuredDimensionsHash = config.dimensions ? dimensionsHash(config.dimensions) : null;
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(count_value), 0) AS count_value
       FROM aggregates
       WHERE signal_id = ? AND bucket_type = ? AND bucket_start_at >= ? AND bucket_start_at <= ?
         AND (? IS NULL OR dimensions_hash = ?)`,
    )
    .bind(watch.signal_id, bucketType, startAt, checkNow, configuredDimensionsHash, configuredDimensionsHash)
    .first();
  const currentValue = Number(row?.count_value || 0);
  const evaluation = {
    supported: true,
    triggered: currentValue < minimumCount,
    current_value: currentValue,
    threshold: minimumCount,
    severity: config.severity || 'warning',
  };
  const [state, actionControls] = await Promise.all([
    db.prepare('SELECT * FROM watch_states WHERE watch_id = ? LIMIT 1').bind(watch.id).first(),
    loadActiveWatchActionControls(db, watch, now),
  ]);
  const decision = decideAlertAction({ watch, evaluation, state, actionControls, now });
  if (!['alert', 'escalation', 'recovery'].includes(decision.action)) {
    await recordWatchEvaluationState({ db, watch, evaluation, decision, now });
    return { triggered: false, action: decision.action, reason: decision.reason };
  }

  const persisted = await persistAlertWithDeliveries({
    db,
    watch,
    evaluation,
    decision,
    input: {
      signalId: watch.signal_id,
      bucketType,
      bucketStartAt: startAt,
    },
    now,
  });
  return { triggered: true, alert: persisted.alert, deliveries: persisted.deliveries };
}

export async function evaluateMissingExpectedWatches({ db, now = new Date().toISOString() }) {
  const watches = await loadMissingExpectedWatches(db);
  let triggered = 0;
  for (const watch of watches) {
    const result = await evaluateMissingExpectedWatch({ db, watch, now });
    if (result.triggered) triggered += 1;
  }
  return { watches: watches.length, triggered };
}
