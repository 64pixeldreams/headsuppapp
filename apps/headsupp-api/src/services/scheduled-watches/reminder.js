import { parseWatchJson } from '../watches/evaluate-watch.js';
import { decideAlertAction } from '../watches/alert-decision.js';
import { loadActiveWatchActionControls } from '../watches/action-controls.js';
import { recordWatchEvaluationState } from '../watches/state.js';
import { persistAlertWithDeliveries } from '../alerts/persistence.js';

function durationMs(duration = {}) {
  const count = Number(duration.count || 0);
  const unit = duration.unit || 'day';
  if (unit === 'minute') return count * 60 * 1000;
  if (unit === 'hour') return count * 60 * 60 * 1000;
  return count * 24 * 60 * 60 * 1000;
}

function reminderWindow(config = {}) {
  const dueAt = config.due_at || config.dueAt;
  if (!dueAt) return null;
  const dueTime = Date.parse(dueAt);
  if (!Number.isFinite(dueTime)) return null;
  const leadMs = durationMs(config.lead || config.remind_before || { count: 0, unit: 'day' });
  const expiresAfterMs =
    config.expires_after_seconds === undefined ? null : Number(config.expires_after_seconds || 0) * 1000;
  return {
    due_at: new Date(dueTime).toISOString(),
    remind_at: new Date(dueTime - leadMs).toISOString(),
    expires_at: expiresAfterMs === null ? null : new Date(dueTime + expiresAfterMs).toISOString(),
  };
}

export async function loadReminderWatches(db) {
  const result = await db.prepare("SELECT * FROM watches WHERE watch_type = 'REMINDER_DUE' AND enabled = 1").all();
  return result?.results || [];
}

export async function evaluateReminderWatch({ db, watch, now = new Date().toISOString() }) {
  const config = parseWatchJson(watch.config_json);
  const window = reminderWindow(config);
  if (!window) {
    await recordWatchEvaluationState({
      db,
      watch,
      evaluation: { supported: false, triggered: false, reason: 'REMINDER_DUE_AT_REQUIRED' },
      decision: { action: 'none', reason: 'REMINDER_DUE_AT_REQUIRED' },
      now,
    });
    return { triggered: false, reason: 'REMINDER_DUE_AT_REQUIRED' };
  }

  const nowMs = Date.parse(now);
  const remindMs = Date.parse(window.remind_at);
  const expiresMs = window.expires_at ? Date.parse(window.expires_at) : null;
  const evaluation = {
    supported: true,
    triggered: nowMs >= remindMs && (expiresMs === null || nowMs <= expiresMs),
    current_value: Math.floor((Date.parse(window.due_at) - nowMs) / 1000),
    threshold: 0,
    severity: config.severity || 'warning',
    fields: {
      due_at: window.due_at,
      remind_at: window.remind_at,
      expires_at: window.expires_at,
      label: config.label || null,
    },
    cta: config.cta || null,
  };

  const [state, actionControls] = await Promise.all([
    db.prepare('SELECT * FROM watch_states WHERE watch_id = ? LIMIT 1').bind(watch.id).first(),
    loadActiveWatchActionControls(db, watch, now),
  ]);

  if (nowMs < remindMs) {
    await recordWatchEvaluationState({
      db,
      watch,
      evaluation,
      decision: { action: 'none', reason: 'REMINDER_NOT_DUE' },
      now,
    });
    return { triggered: false, reason: 'REMINDER_NOT_DUE', remind_at: window.remind_at };
  }

  if (expiresMs !== null && nowMs > expiresMs) {
    await recordWatchEvaluationState({
      db,
      watch,
      evaluation: { ...evaluation, triggered: false },
      decision: { action: 'none', reason: 'REMINDER_EXPIRED' },
      now,
    });
    return { triggered: false, reason: 'REMINDER_EXPIRED' };
  }

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
      bucketType: 'reminder',
      bucketStartAt: window.due_at,
    },
    now,
  });
  return { triggered: true, alert: persisted.alert, deliveries: persisted.deliveries };
}

export async function evaluateReminderWatches({ db, now = new Date().toISOString() }) {
  const watches = await loadReminderWatches(db);
  let triggered = 0;
  for (const watch of watches) {
    const result = await evaluateReminderWatch({ db, watch, now });
    if (result.triggered) triggered += 1;
  }
  return { watches: watches.length, triggered };
}
