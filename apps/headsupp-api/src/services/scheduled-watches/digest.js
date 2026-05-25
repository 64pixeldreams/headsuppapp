import { parseWatchJson } from '../watches/evaluate-watch.js';
import { persistAlertWithDeliveries } from '../alerts/persistence.js';
import { actionControlGate, loadActiveWatchActionControls } from '../watches/action-controls.js';
import { recordWatchEvaluationState } from '../watches/state.js';

function digestDue(config, state, now) {
  if (!state?.last_digest_at) return true;
  const elapsedMs = Date.parse(now) - Date.parse(state.last_digest_at);
  const intervalMs = config.schedule === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return elapsedMs >= intervalMs;
}

export async function loadDigestWatches(db) {
  const result = await db.prepare("SELECT * FROM watches WHERE watch_type = 'DIGEST' AND enabled = 1").all();
  return result?.results || [];
}

export async function evaluateDigestWatch({ db, watch, now = new Date().toISOString() }) {
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

  const aggregate = await db
    .prepare('SELECT * FROM aggregates WHERE signal_id = ? ORDER BY bucket_start_at DESC LIMIT 1')
    .bind(watch.signal_id)
    .first();
  const currentValue = aggregate?.last_value ?? null;
  const evaluation = {
    supported: true,
    triggered: true,
    current_value: currentValue,
    threshold: null,
    severity: config.severity || 'info',
  };
  const decision = { action: 'alert', severity: evaluation.severity, current_value: currentValue };
  const persisted = await persistAlertWithDeliveries({
    db,
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
    .bind(watch.id, 'digest', now, now, JSON.stringify({ include: config.include || [] }), now)
    .run();

  return { triggered: true, alert: persisted.alert, deliveries: persisted.deliveries };
}

export async function evaluateDigestWatches({ db, now = new Date().toISOString() }) {
  const watches = await loadDigestWatches(db);
  let triggered = 0;
  for (const watch of watches) {
    const result = await evaluateDigestWatch({ db, watch, now });
    if (result.triggered) triggered += 1;
  }
  return { watches: watches.length, triggered };
}
