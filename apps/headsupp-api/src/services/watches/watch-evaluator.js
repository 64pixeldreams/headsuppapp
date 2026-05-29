import { evaluateWatchAgainstAggregates, watchConfig } from './evaluate-watch.js';
import { evaluateEventOccurrence } from './evaluate-watch.js';
import { decideAlertAction } from './alert-decision.js';
import { actionControlGate, loadActiveWatchActionControls } from './action-controls.js';
import { recordWatchEvaluationState } from './state.js';
import { persistAlertWithDeliveries } from '../alerts/persistence.js';
import { evaluateWatchGroupRequest, loadWatchGroup } from './watch-groups.js';

export async function loadWatch(db, watchId) {
  return db.prepare('SELECT * FROM watches WHERE id = ? OR watch_id = ? LIMIT 1').bind(watchId, watchId).first();
}

export async function loadWatchState(db, watchId) {
  return db.prepare('SELECT * FROM watch_states WHERE watch_id = ? LIMIT 1').bind(watchId).first();
}

function shortHash(value) {
  let hash = 5381;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

function occurrenceId({ watch, occurrenceKey }) {
  const seed = `${watch.workspace_id}:${watch.channel_id}:${watch.id || watch.watch_id}:${occurrenceKey}`;
  return `occ_${shortHash(seed)}_${String(occurrenceKey).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 44) || 'event'}`;
}

async function reserveWatchOccurrence({ db, watch, occurrenceKey, now }) {
  const existing = await db
    .prepare(
      `SELECT *
       FROM watch_occurrences
       WHERE workspace_id = ? AND channel_id = ? AND watch_id = ? AND occurrence_key = ?
       LIMIT 1`,
    )
    .bind(watch.workspace_id, watch.channel_id, watch.id || watch.watch_id, occurrenceKey)
    .first();
  if (existing) return { reserved: false, occurrence: existing };

  const id = occurrenceId({ watch, occurrenceKey });
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO watch_occurrences (
        id, workspace_id, channel_id, watch_id, occurrence_key, alert_id,
        first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      watch.workspace_id,
      watch.channel_id,
      watch.id || watch.watch_id,
      occurrenceKey,
      null,
      now,
      now,
      now,
      now,
    )
    .run();
  if (result?.meta?.changes === 0) {
    const duplicate = await db
      .prepare('SELECT * FROM watch_occurrences WHERE id = ? LIMIT 1')
      .bind(id)
      .first();
    return { reserved: false, occurrence: duplicate || { id, occurrence_key: occurrenceKey } };
  }
  return { reserved: true, occurrence: { id, occurrence_key: occurrenceKey } };
}

async function linkWatchOccurrenceAlert({ db, occurrenceId: id, alertId, now }) {
  await db
    .prepare('UPDATE watch_occurrences SET alert_id = ?, last_seen_at = ?, updated_at = ? WHERE id = ?')
    .bind(alertId, now, now, id)
    .run();
}

export async function loadAggregatesForWatch(db, watch, input) {
  const config = watchConfig(watch);
  const bucketType = input.bucketType || config.bucket_type;
  const dimensionsHash = input.dimensionsHash || null;

  const needsWindowRows =
    watch.watch_type.startsWith('WINDOW_') ||
    watch.watch_type.startsWith('DELTA_') ||
    watch.watch_type.startsWith('PERCENT_CHANGE_') ||
    watch.watch_type.startsWith('PREVIOUS_PERIOD_RATIO_') ||
    watch.watch_type.startsWith('TREND_') ||
    watch.watch_type === 'SPIKE_GT';

  if (needsWindowRows) {
    const limit = watch.watch_type.startsWith('WINDOW_') || watch.watch_type.startsWith('TREND_')
      ? Number(config.window?.size || 60)
      : 2;
    const result = await db
      .prepare(
        `SELECT *
         FROM aggregates
         WHERE signal_id = ? AND bucket_type = ? AND bucket_start_at <= ?
           AND (? IS NULL OR dimensions_hash = ?)
         ORDER BY bucket_start_at DESC
         LIMIT ?`,
      )
      .bind(watch.signal_id || input.signalId, bucketType, input.bucketStartAt, dimensionsHash, dimensionsHash, limit)
      .all();
    return (result?.results || []).reverse();
  }

  const aggregate = await db
    .prepare(
      `SELECT *
       FROM aggregates
       WHERE signal_id = ? AND bucket_type = ? AND bucket_start_at = ?
         AND (? IS NULL OR dimensions_hash = ?)
       LIMIT 1`,
    )
    .bind(watch.signal_id || input.signalId, bucketType, input.bucketStartAt, dimensionsHash, dimensionsHash)
    .first();

  return aggregate ? [aggregate] : [];
}

export async function evaluateWatchRequest({ db, env = {}, input, now = input.now || new Date().toISOString() }) {
  const watch = await loadWatch(db, input.watchId);
  if (!watch) {
    return {
      evaluated: false,
      reason: 'WATCH_NOT_FOUND',
    };
  }

  if (watch.enabled === 0 || watch.enabled === false) {
    return {
      evaluated: false,
      reason: 'WATCH_DISABLED',
    };
  }

  if (watch.watch_group_id) {
    const group = await loadWatchGroup(db, watch.watch_group_id);
    if (group?.enabled === 0 || group?.enabled === false) {
      return {
        evaluated: false,
        reason: 'WATCH_GROUP_DISABLED',
      };
    }
    if (group) {
      return evaluateWatchGroupRequest({
        db,
        env,
        group,
        input,
        loadAggregatesForWatch,
        now,
      });
    }
  }

  if (watch.watch_type === 'EVENT_OCCURRENCE') {
    const actionControls = await loadActiveWatchActionControls(db, watch, now);
    const actionGate = actionControlGate(actionControls, now);
    if (actionGate.blocked) {
      return {
        evaluated: true,
        action: 'none',
        reason: actionGate.reason,
        action_control_id: actionGate.control?.id || actionGate.control?.action_id || null,
      };
    }

    const evaluation = evaluateEventOccurrence(watch, input.eventContext || {});
    if (!evaluation.supported || !evaluation.triggered) {
      return {
        evaluated: true,
        action: 'none',
        reason: evaluation.reason,
        evaluation,
      };
    }

    const reservation = await reserveWatchOccurrence({
      db,
      watch,
      occurrenceKey: evaluation.occurrence_key,
      now,
    });
    if (!reservation.reserved) {
      return {
        evaluated: true,
        action: 'none',
        reason: 'OCCURRENCE_ALREADY_PROCESSED',
        occurrence_key: evaluation.occurrence_key,
        alert_id: reservation.occurrence?.alert_id || null,
      };
    }

    const decision = {
      action: 'alert',
      severity: evaluation.severity || 'info',
      current_value: evaluation.current_value,
      occurrence_key: evaluation.occurrence_key,
    };
    const persisted = await persistAlertWithDeliveries({
      db,
      queue: env.ALERT_DELIVERY_QUEUE,
      watch,
      evaluation,
      decision,
      input,
      now,
    });
    await linkWatchOccurrenceAlert({
      db,
      occurrenceId: reservation.occurrence.id,
      alertId: persisted.alert.id,
      now,
    });
    return {
      evaluated: true,
      action: decision.action,
      alert_id: persisted.alert.id,
      occurrence_key: evaluation.occurrence_key,
      deliveries: persisted.deliveries.length,
      enqueued_deliveries: persisted.enqueued_deliveries,
    };
  }

  const [state, aggregates, actionControls] = await Promise.all([
    loadWatchState(db, watch.id || watch.watch_id),
    loadAggregatesForWatch(db, watch, input),
    loadActiveWatchActionControls(db, watch, now),
  ]);
  const evaluation = evaluateWatchAgainstAggregates(watch, aggregates);
  if (input.eventContext) {
    evaluation.cta = input.eventContext.cta || evaluation.cta || null;
    evaluation.fields = {
      ...(evaluation.fields || {}),
      ...(input.eventContext.fields || {}),
    };
  }
  const decision = decideAlertAction({ watch, evaluation, state, actionControls, now });

  if (!['alert', 'escalation', 'recovery'].includes(decision.action)) {
    await recordWatchEvaluationState({ db, watch, evaluation, decision, now });
    return {
      evaluated: true,
      action: decision.action,
      reason: decision.reason,
      evaluation,
    };
  }

  const persisted = await persistAlertWithDeliveries({
    db,
    queue: env.ALERT_DELIVERY_QUEUE,
    watch,
    evaluation,
    decision,
    input,
    now,
  });

  return {
    evaluated: true,
    action: decision.action,
    alert_id: persisted.alert.id,
    deliveries: persisted.deliveries.length,
    enqueued_deliveries: persisted.enqueued_deliveries,
  };
}
