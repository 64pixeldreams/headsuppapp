function statusFromDecision(decision = {}, evaluation = {}) {
  if (decision.action === 'alert' || decision.action === 'escalation') return 'triggered';
  if (decision.action === 'recovery') return 'recovered';
  if (decision.reason === 'COOLDOWN_ACTIVE') return 'cooldown';
  if (decision.reason === 'WATCH_SNOOZED') return 'snoozed';
  if (decision.reason === 'WATCH_MUTED') return 'muted';
  if (!evaluation.supported) return 'unsupported';
  if (evaluation.current_value === null || evaluation.current_value === undefined) return 'no_data';
  return 'quiet';
}

export async function recordWatchEvaluationState({
  db,
  watch,
  evaluation = {},
  decision = {},
  now = new Date().toISOString(),
}) {
  const watchId = watch.id || watch.watch_id;
  const status = statusFromDecision(decision, evaluation);
  await db
    .prepare(
      `INSERT INTO watch_states (
        watch_id, last_status, last_evaluated_at, state_json, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(watch_id)
      DO UPDATE SET
        last_status = excluded.last_status,
        last_evaluated_at = excluded.last_evaluated_at,
        state_json = excluded.state_json,
        updated_at = excluded.updated_at`,
    )
    .bind(
      watchId,
      status,
      now,
      JSON.stringify({
        action: decision.action || 'none',
        reason: decision.reason || null,
        current_value: decision.current_value ?? evaluation.current_value ?? null,
        threshold: evaluation.threshold ?? null,
        severity: decision.severity || evaluation.severity || null,
      }),
      now,
    )
    .run();
  return { watch_id: watchId, last_status: status, last_evaluated_at: now };
}
