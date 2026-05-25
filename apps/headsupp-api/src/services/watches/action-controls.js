import { stableId } from '../ids/stable-id.js';

export function isActiveControl(control, now = new Date().toISOString()) {
  if (!control || control.status !== 'active') return false;
  if (!control.expires_at) return true;
  return Date.parse(control.expires_at) > Date.parse(now);
}

export function actionControlGate(controls = [], now = new Date().toISOString()) {
  const active = controls.filter((control) => isActiveControl(control, now));
  const mute = active.find((control) => control.action_type === 'mute');
  if (mute) return { blocked: true, reason: 'WATCH_MUTED', control: mute };
  const snooze = active.find((control) => control.action_type === 'snooze');
  if (snooze) return { blocked: true, reason: 'WATCH_SNOOZED', control: snooze };
  return { blocked: false };
}

export async function loadActiveWatchActionControls(db, watch, now = new Date().toISOString()) {
  const watchId = watch.id || watch.watch_id;
  const signalId = watch.signal_id;
  const result = await db
    .prepare(
      `SELECT *
       FROM watch_action_controls
       WHERE status = 'active'
         AND action_type IN ('snooze', 'mute')
         AND (expires_at IS NULL OR expires_at > ?)
         AND (
           (target_type = 'watch' AND target_id = ?)
           OR (target_type = 'signal' AND target_id = ?)
         )
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .bind(now, watchId, signalId)
    .all();
  return result?.results || [];
}

export function buildActionControlRow({
  input,
  targetType,
  targetId,
  actionType,
  status = 'active',
  actorUserId = null,
  now = new Date().toISOString(),
}) {
  const expiresAt = input.expires_at || input.snooze_until || input.mute_until || null;
  const id = input.action_id || stableId('watchact', `${actionType}:${targetType}:${targetId}:${now}`);
  return {
    id,
    action_id: id,
    workspace_id: input.workspace_id,
    channel_id: input.channel_id,
    target_type: targetType,
    target_id: targetId,
    action_type: actionType,
    status,
    reason: input.reason || null,
    expires_at: expiresAt,
    actor_user_id: actorUserId,
    source_app: input.source_app || null,
    external_tenant_id: input.external_tenant_id || null,
    external_user_id: input.external_user_id || null,
    created_at: now,
    updated_at: now,
  };
}
