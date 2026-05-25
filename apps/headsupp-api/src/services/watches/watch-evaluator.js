import { evaluateWatchAgainstAggregates, watchConfig } from './evaluate-watch.js';
import { decideAlertAction } from './alert-decision.js';
import { loadActiveWatchActionControls } from './action-controls.js';
import { recordWatchEvaluationState } from './state.js';
import { persistAlertWithDeliveries } from '../alerts/persistence.js';

export async function loadWatch(db, watchId) {
  return db.prepare('SELECT * FROM watches WHERE id = ? OR watch_id = ? LIMIT 1').bind(watchId, watchId).first();
}

export async function loadWatchState(db, watchId) {
  return db.prepare('SELECT * FROM watch_states WHERE watch_id = ? LIMIT 1').bind(watchId).first();
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
    watch.watch_type === 'SPIKE_GT';

  if (needsWindowRows) {
    const limit = watch.watch_type.startsWith('WINDOW_') ? Number(config.window?.size || 60) : 2;
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

async function enqueueAlertDeliveries(queue, deliveries) {
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

  const [state, aggregates, actionControls] = await Promise.all([
    loadWatchState(db, watch.id || watch.watch_id),
    loadAggregatesForWatch(db, watch, input),
    loadActiveWatchActionControls(db, watch, now),
  ]);
  const evaluation = evaluateWatchAgainstAggregates(watch, aggregates);
  if (input.eventContext) {
    evaluation.cta = input.eventContext.cta || evaluation.cta || null;
    evaluation.fields = input.eventContext.fields || evaluation.fields || {};
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
    watch,
    evaluation,
    decision,
    input,
    now,
  });
  const enqueued_deliveries = await enqueueAlertDeliveries(env.ALERT_DELIVERY_QUEUE, persisted.deliveries);

  return {
    evaluated: true,
    action: decision.action,
    alert_id: persisted.alert.id,
    deliveries: persisted.deliveries.length,
    enqueued_deliveries,
  };
}
