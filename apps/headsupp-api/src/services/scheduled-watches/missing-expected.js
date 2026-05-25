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
  else if (unit === 'week') date.setUTCDate(date.getUTCDate() - count * 7);
  else if (unit === 'month') date.setUTCMonth(date.getUTCMonth() - count);
  else date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString();
}

function dueWindow(config, checkNow) {
  const explicit = config.due_window || config.dueWindow;
  if (explicit?.start_at && explicit?.end_at) {
    return { startAt: new Date(explicit.start_at).toISOString(), endAt: new Date(explicit.end_at).toISOString() };
  }
  return { startAt: windowStart(checkNow, config.expected_every), endAt: checkNow };
}

function valueFromRow(row, field = 'count') {
  if (field === 'sum') return Number(row?.sum_value || 0);
  if (field === 'avg') return row?.avg_value === null || row?.avg_value === undefined ? null : Number(row.avg_value);
  if (field === 'min') return row?.min_value === null || row?.min_value === undefined ? null : Number(row.min_value);
  if (field === 'max') return row?.max_value === null || row?.max_value === undefined ? null : Number(row.max_value);
  return Number(row?.count_value || 0);
}

function rangeTriggered(value, valueRange) {
  if (!valueRange) return false;
  if (value === null || value === undefined || !Number.isFinite(value)) return true;
  if (valueRange.min !== undefined && value < Number(valueRange.min)) return true;
  if (valueRange.max !== undefined && value > Number(valueRange.max)) return true;
  return false;
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
  const { startAt, endAt } = dueWindow(config, checkNow);
  const minimumCount = Number(config.minimum_count || 1);
  const bucketType = config.bucket_type || 'day';
  const configuredDimensionsHash = config.dimensions ? dimensionsHash(config.dimensions) : null;
  const valueRange = config.value_range || config.expected_value_range || null;
  const valueField = valueRange?.field || config.value_field || 'count';
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(count_value), 0) AS count_value,
         COALESCE(SUM(sum_value), 0) AS sum_value,
         CASE WHEN COALESCE(SUM(count_value), 0) > 0 THEN COALESCE(SUM(sum_value), 0) / SUM(count_value) ELSE NULL END AS avg_value,
         MIN(min_value) AS min_value,
         MAX(max_value) AS max_value
       FROM aggregates
       WHERE signal_id = ? AND bucket_type = ? AND bucket_start_at >= ? AND bucket_start_at <= ?
         AND (? IS NULL OR dimensions_hash = ?)`,
    )
    .bind(watch.signal_id, bucketType, startAt, endAt, configuredDimensionsHash, configuredDimensionsHash)
    .first();
  const currentValue = Number(row?.count_value || 0);
  const rangeValue = valueFromRow(row, valueField);
  const rangeFailed = rangeTriggered(rangeValue, valueRange);
  const evaluation = {
    supported: true,
    triggered: currentValue < minimumCount || rangeFailed,
    current_value: valueRange ? rangeValue : currentValue,
    threshold: valueRange ? Number(valueRange.min ?? valueRange.max) : minimumCount,
    severity: config.severity || 'warning',
    fields: {
      count_value: currentValue,
      value_field: valueField,
      range_value: rangeValue,
      due_window_start_at: startAt,
      due_window_end_at: endAt,
    },
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
