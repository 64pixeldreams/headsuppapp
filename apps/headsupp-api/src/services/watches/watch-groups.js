import { stableId } from '../ids/stable-id.js';
import { persistAlertWithDeliveries } from '../alerts/persistence.js';
import { cooldownUntil, recoveryTriggered, severityIncreased } from './alert-decision.js';
import { evaluateWatchAgainstAggregates, parseWatchJson, watchConfig } from './evaluate-watch.js';

const SEVERITY_RANK = Object.freeze({
  info: 100,
  watch: 100,
  warning: 200,
  critical: 300,
});

function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

function winnerPolicy(group) {
  const policy = group?.winner_policy || 'highest_severity_wins';
  return policy === 'lowest_severity_wins' ? policy : 'highest_severity_wins';
}

function thresholdSpecificity(watch, evaluation) {
  const config = watchConfig(watch);
  return Number(evaluation?.threshold ?? config.threshold ?? 0);
}

export function selectWatchGroupWinner(candidates, group) {
  const sorted = [...candidates].sort((left, right) => {
    const leftRank = severityRank(left.evaluation.severity);
    const rightRank = severityRank(right.evaluation.severity);
    if (leftRank !== rightRank) {
      return winnerPolicy(group) === 'lowest_severity_wins' ? leftRank - rightRank : rightRank - leftRank;
    }
    const leftThreshold = thresholdSpecificity(left.watch, left.evaluation);
    const rightThreshold = thresholdSpecificity(right.watch, right.evaluation);
    if (leftThreshold !== rightThreshold) {
      return winnerPolicy(group) === 'lowest_severity_wins' ? leftThreshold - rightThreshold : rightThreshold - leftThreshold;
    }
    return String(left.watch.band_key || left.watch.watch_id || left.watch.id).localeCompare(
      String(right.watch.band_key || right.watch.watch_id || right.watch.id),
    );
  });
  return sorted[0] || null;
}

export async function loadWatchGroup(db, watchGroupId) {
  return db.prepare('SELECT * FROM watch_groups WHERE id = ? OR watch_group_id = ? LIMIT 1').bind(watchGroupId, watchGroupId).first();
}

export async function loadWatchGroupWatches(db, watchGroupId) {
  const result = await db
    .prepare(
      `SELECT *
       FROM watches
       WHERE watch_group_id = ? AND enabled = 1
       ORDER BY band_key ASC, created_at ASC`,
    )
    .bind(watchGroupId)
    .all();
  return result?.results || [];
}

export async function loadWatchGroupState(db, watchGroupId) {
  return db.prepare('SELECT * FROM watch_group_states WHERE watch_group_id = ? LIMIT 1').bind(watchGroupId).first();
}

function groupRecoveryTriggered(group, currentValue) {
  const recovery = parseWatchJson(group.recovery_json);
  const enabled = recovery.enabled !== false;
  return enabled && recoveryTriggered({ recovery_json: JSON.stringify({ ...recovery, enabled: true }) }, currentValue);
}

function groupRecoverySeverity(group) {
  const recovery = parseWatchJson(group.recovery_json);
  return recovery.severity || 'recovery';
}

function groupStateStatement(db, { group, winner, decision, candidates, now }) {
  const cooldown = decision.action === 'recovery' ? null : cooldownUntil(now, group.cooldown_seconds ?? 86400);
  const suppressed = candidates
    .filter((candidate) => candidate !== winner)
    .map((candidate) => ({
      watch_id: candidate.watch.id || candidate.watch.watch_id,
      band_key: candidate.watch.band_key || null,
      severity: candidate.evaluation.severity,
      reason: 'GROUP_WINNER_SELECTED',
      winner_watch_id: winner?.watch?.id || winner?.watch?.watch_id || null,
    }));
  return db
    .prepare(
      `INSERT INTO watch_group_states (
        watch_group_id, last_status, last_evaluated_at, last_alert_at, last_alert_value, last_alert_severity,
        cooldown_until, last_recovery_at, state_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(watch_group_id)
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
      group.id || group.watch_group_id,
      decision.action === 'recovery' ? 'recovered' : 'triggered',
      now,
      decision.action === 'recovery' ? null : now,
      decision.current_value,
      decision.severity,
      cooldown,
      decision.action === 'recovery' ? now : null,
      JSON.stringify({
        action: decision.action,
        winner_policy: winnerPolicy(group),
        winner_watch_id: winner?.watch?.id || winner?.watch?.watch_id || null,
        winner_band_key: winner?.watch?.band_key || null,
        suppressed_candidates: suppressed,
      }),
      now,
    );
}

function isGroupCoolingDown(state, now) {
  return Boolean(state?.cooldown_until && Date.parse(state.cooldown_until) > Date.parse(now));
}

function withGroupFields(evaluation, group, watch, candidates) {
  return {
    ...evaluation,
    fields: {
      ...(evaluation.fields || {}),
      watch_group: {
        watch_group_id: group.id || group.watch_group_id,
        watch_group_key: group.group_key,
        winner_policy: winnerPolicy(group),
        band_key: watch.band_key || null,
        candidate_count: candidates.length,
      },
    },
  };
}

export async function evaluateWatchGroupRequest({
  db,
  env = {},
  group,
  input,
  loadAggregatesForWatch,
  now = input.now || new Date().toISOString(),
}) {
  const watches = await loadWatchGroupWatches(db, group.id || group.watch_group_id);
  if (watches.length === 0) {
    return { evaluated: true, action: 'none', reason: 'WATCH_GROUP_EMPTY' };
  }

  const state = await loadWatchGroupState(db, group.id || group.watch_group_id);
  const evaluated = [];
  for (const watch of watches) {
    const aggregates = await loadAggregatesForWatch(db, watch, input);
    const evaluation = evaluateWatchAgainstAggregates(watch, aggregates);
    if (input.eventContext) {
      evaluation.cta = input.eventContext.cta || evaluation.cta || null;
      evaluation.fields = input.eventContext.fields || evaluation.fields || {};
    }
    evaluated.push({ watch, evaluation });
  }

  const candidates = evaluated.filter((candidate) => candidate.evaluation.supported && candidate.evaluation.triggered);
  const currentValue = evaluated.find((candidate) => candidate.evaluation.current_value !== null && candidate.evaluation.current_value !== undefined)
    ?.evaluation.current_value;

  if (candidates.length === 0) {
    if (state?.last_status === 'triggered' && groupRecoveryTriggered(group, currentValue)) {
      const recoveryWatch = watches[0];
      const recoveryEvaluation = withGroupFields(
        { supported: true, triggered: true, current_value: currentValue, threshold: null, fields: {}, cta: input.eventContext?.cta || null },
        group,
        recoveryWatch,
        [],
      );
      const decision = { action: 'recovery', severity: groupRecoverySeverity(group), current_value: currentValue };
      const persisted = await persistAlertWithDeliveries({
        db,
        queue: env.ALERT_DELIVERY_QUEUE,
        watch: recoveryWatch,
        evaluation: recoveryEvaluation,
        decision,
        input,
        now,
      });
      await groupStateStatement(db, { group, winner: { watch: recoveryWatch, evaluation: recoveryEvaluation }, decision, candidates: [], now }).run();
      return {
        evaluated: true,
        action: 'recovery',
        alert_id: persisted.alert.id,
        deliveries: persisted.deliveries.length,
        enqueued_deliveries: persisted.enqueued_deliveries,
      };
    }
    return { evaluated: true, action: 'none', reason: 'WATCH_GROUP_NOT_TRIGGERED' };
  }

  const winner = selectWatchGroupWinner(candidates, group);
  const nextSeverity = winner.evaluation.severity || 'warning';
  if (isGroupCoolingDown(state, now) && !severityIncreased(state?.last_alert_severity, nextSeverity)) {
    return { evaluated: true, action: 'none', reason: 'GROUP_COOLDOWN_ACTIVE', winner: winner.watch.band_key || winner.watch.watch_id };
  }

  const action = isGroupCoolingDown(state, now) ? 'escalation' : 'alert';
  const evaluation = withGroupFields(winner.evaluation, group, winner.watch, candidates);
  const decision = { action, severity: nextSeverity, current_value: winner.evaluation.current_value };
  const persisted = await persistAlertWithDeliveries({
    db,
    queue: env.ALERT_DELIVERY_QUEUE,
    watch: winner.watch,
    evaluation,
    decision,
    input: {
      ...input,
      watchGroupId: group.id || group.watch_group_id,
    },
    now,
  });
  await groupStateStatement(db, { group, winner, decision, candidates, now }).run();
  return {
    evaluated: true,
    action,
    alert_id: persisted.alert.id,
    deliveries: persisted.deliveries.length,
    enqueued_deliveries: persisted.enqueued_deliveries,
    winner: winner.watch.band_key || winner.watch.watch_id,
    suppressed: Math.max(0, candidates.length - 1),
  };
}

export function watchGroupIdForBand(channelId, signalId, groupKey) {
  return stableId('wg', `${channelId}:${signalId}:${groupKey}`);
}
