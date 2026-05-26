import { stableId } from '../ids/stable-id.js';
import { buildActionControlRow } from '../watches/action-controls.js';

const STANDARD_EMAIL_ACTIONS = Object.freeze({
  snooze_1h: Object.freeze({ id: 'snooze_1h', kind: 'snooze', label: 'SNOOZE 1H', duration_seconds: 60 * 60 }),
  snooze_6h: Object.freeze({ id: 'snooze_6h', kind: 'snooze', label: 'SNOOZE 6H', duration_seconds: 60 * 60 * 6 }),
  snooze_1d: Object.freeze({ id: 'snooze_1d', kind: 'snooze', label: 'SNOOZE 1D', duration_seconds: 60 * 60 * 24 }),
  snooze_7d: Object.freeze({ id: 'snooze_7d', kind: 'snooze', label: 'SNOOZE 7D', duration_seconds: 60 * 60 * 24 * 7 }),
  stop_watching: Object.freeze({ id: 'stop_watching', kind: 'stop_watching', label: 'STOP WATCHING' }),
});

function base64UrlEncode(value) {
  const source = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of source) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getSecrets(env = {}) {
  return [
    env.HEADSUPP_EMAIL_ACTION_SECRET,
    env.HEADSUPP_EMAIL_ACTION_SECRET_PREVIOUS,
    env.HEADSUPP_UNSUBSCRIBE_SECRET,
    env.HEADSUPP_UNSUBSCRIBE_SECRET_PREVIOUS,
  ].filter(Boolean);
}

function parsePayload(encodedPayload) {
  try {
    return JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
}

async function signTokenPart(secret, payloadPart) {
  const data = new TextEncoder().encode(payloadPart);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return base64UrlEncode(new Uint8Array(signature));
}

export function normalizeEmailActionIds(actions = []) {
  if (!Array.isArray(actions)) return [];
  const seen = new Set();
  const normalized = [];
  for (const actionId of actions) {
    const id = String(actionId || '').trim().toLowerCase();
    if (!STANDARD_EMAIL_ACTIONS[id] || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

export function getStandardEmailAction(actionId) {
  return STANDARD_EMAIL_ACTIONS[String(actionId || '').trim().toLowerCase()] || null;
}

export async function createEmailActionToken({
  env,
  subscriberId,
  workspaceId,
  channelId,
  watchId,
  alertId,
  deliveryId,
  actionId,
  now = new Date().toISOString(),
  ttlSeconds = Number(env?.HEADSUPP_EMAIL_ACTION_TTL_SECONDS || 60 * 60 * 24 * 7),
}) {
  const action = getStandardEmailAction(actionId);
  const [secret] = getSecrets(env);
  if (!secret || !action || !subscriberId || !workspaceId || !channelId || !watchId) return null;

  const issuedAt = Math.floor(Date.parse(now) / 1000);
  const expiresAt = issuedAt + Math.max(60, Number(ttlSeconds) || 60);
  const actionKey = stableId(
    'emailact',
    `${subscriberId}:${watchId}:${alertId || 'no-alert'}:${deliveryId || 'no-delivery'}:${action.id}`,
  );
  const payload = {
    sub: subscriberId,
    ws: workspaceId,
    ch: channelId,
    watch: watchId,
    alert: alertId || null,
    delivery: deliveryId || null,
    action: action.id,
    kind: action.kind,
    dur: action.duration_seconds || null,
    key: actionKey,
    iat: issuedAt,
    exp: expiresAt,
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await signTokenPart(secret, payloadPart);
  return `${payloadPart}.${signature}`;
}

export async function verifyEmailActionToken({ token, env, now = new Date().toISOString() }) {
  const [payloadPart, signature] = String(token || '').split('.');
  if (!payloadPart || !signature) return { ok: false, code: 'INVALID_TOKEN' };

  const payload = parsePayload(payloadPart);
  if (!payload || !payload.sub || !payload.ws || !payload.ch || !payload.watch || !payload.action || !payload.key || !payload.exp) {
    return { ok: false, code: 'INVALID_TOKEN' };
  }
  if (!getStandardEmailAction(payload.action)) return { ok: false, code: 'INVALID_ACTION' };

  const nowSeconds = Math.floor(Date.parse(now) / 1000);
  if (Number(payload.exp) < nowSeconds) return { ok: false, code: 'EXPIRED_TOKEN' };

  const secrets = getSecrets(env);
  if (secrets.length === 0) return { ok: false, code: 'EMAIL_ACTIONS_NOT_CONFIGURED' };

  for (const secret of secrets) {
    const expected = await signTokenPart(secret, payloadPart);
    if (expected === signature) return { ok: true, payload };
  }
  return { ok: false, code: 'INVALID_TOKEN' };
}

export function buildEmailActionUrl({ token, env, confirm = false }) {
  if (!token) return null;
  const root = String(env?.HEADSUPP_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!root) return null;
  const url = new URL(`${root}/v1/subscribers/email-action`);
  url.searchParams.set('token', token);
  if (confirm) url.searchParams.set('confirm', '1');
  return url.toString();
}

export async function buildEmailActionLinks({
  env,
  subscriber,
  alert,
  delivery,
  now = new Date().toISOString(),
}) {
  let config = {};
  try {
    config = typeof subscriber?.config_json === 'object' ? subscriber.config_json : JSON.parse(subscriber?.config_json || '{}');
  } catch {
    config = {};
  }
  const actionIds = normalizeEmailActionIds(config.actions);
  const links = [];
  for (const actionId of actionIds) {
    const action = getStandardEmailAction(actionId);
    const token = await createEmailActionToken({
      env,
      subscriberId: subscriber.id || subscriber.subscriber_id,
      workspaceId: alert.workspace_id,
      channelId: alert.channel_id || subscriber.channel_id,
      watchId: alert.watch_id,
      alertId: alert.id,
      deliveryId: delivery?.id || null,
      actionId,
      now,
    });
    const url = buildEmailActionUrl({ token, env });
    if (!url) continue;
    links.push({
      id: action.id,
      label: action.label,
      kind: action.kind,
      url,
    });
  }
  return links;
}

async function loadSubscriber(db, subscriberId) {
  return db
    .prepare('SELECT * FROM subscribers WHERE id = ? OR subscriber_id = ? LIMIT 1')
    .bind(subscriberId, subscriberId)
    .first();
}

async function loadWatch(db, watchId) {
  return db
    .prepare('SELECT * FROM watches WHERE id = ? OR watch_id = ? LIMIT 1')
    .bind(watchId, watchId)
    .first();
}

async function existingActionControl(db, actionId) {
  return db.prepare('SELECT * FROM watch_action_controls WHERE action_id = ? LIMIT 1').bind(actionId).first();
}

async function applySnoozeAction({ db, payload, now }) {
  const existing = await existingActionControl(db, payload.key);
  if (existing) {
    return {
      ok: true,
      code: 'ALREADY_APPLIED',
      action: payload.action,
      action_control_id: existing.action_id || existing.id,
      workspace_id: payload.ws,
      subscriber_id: payload.sub,
      watch_id: payload.watch,
    };
  }

  const [subscriber, watch] = await Promise.all([loadSubscriber(db, payload.sub), loadWatch(db, payload.watch)]);
  if (!subscriber || !watch || subscriber.workspace_id !== payload.ws || subscriber.channel_id !== payload.ch || watch.channel_id !== payload.ch) {
    return { ok: false, code: 'RESOURCE_NOT_FOUND' };
  }

  const expiresAt = new Date(Date.parse(now) + Number(payload.dur) * 1000).toISOString();
  await db
    .prepare(
      `UPDATE watch_action_controls
       SET status = ?, updated_at = ?
       WHERE workspace_id = ? AND channel_id = ? AND target_type = ? AND target_id = ?
         AND action_type = ? AND status = ?`,
    )
    .bind('cleared', now, payload.ws, payload.ch, 'watch', payload.watch, 'snooze', 'active')
    .run();

  const row = buildActionControlRow({
    input: {
      action_id: payload.key,
      workspace_id: payload.ws,
      channel_id: payload.ch,
      snooze_until: expiresAt,
      reason: `Email action ${payload.action}`,
      source_app: subscriber.source_app || watch.source_app || null,
      external_tenant_id: subscriber.external_tenant_id || watch.external_tenant_id || null,
      external_user_id: subscriber.external_user_id || watch.external_user_id || null,
    },
    targetType: 'watch',
    targetId: payload.watch,
    actionType: 'snooze',
    actorUserId: 'email-recipient',
    now,
  });
  await db
    .prepare(
      `INSERT INTO watch_action_controls (
        id, action_id, workspace_id, channel_id, target_type, target_id, action_type, status,
        reason, expires_at, actor_user_id, source_app, external_tenant_id, external_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.action_id,
      row.workspace_id,
      row.channel_id,
      row.target_type,
      row.target_id,
      row.action_type,
      row.status,
      row.reason,
      row.expires_at,
      row.actor_user_id,
      row.source_app,
      row.external_tenant_id,
      row.external_user_id,
      row.created_at,
      row.updated_at,
    )
    .run();

  return {
    ok: true,
    code: 'SNOOZED',
    action: payload.action,
    action_control_id: row.action_id,
    expires_at: expiresAt,
    workspace_id: payload.ws,
    subscriber_id: payload.sub,
    watch_id: payload.watch,
  };
}

async function applyStopWatchingAction({ db, payload, now }) {
  const subscriber = await loadSubscriber(db, payload.sub);
  if (!subscriber || subscriber.workspace_id !== payload.ws || subscriber.channel_id !== payload.ch) {
    return { ok: false, code: 'RESOURCE_NOT_FOUND' };
  }
  await db
    .prepare('UPDATE subscribers SET enabled = 0, updated_at = ? WHERE id = ? OR subscriber_id = ?')
    .bind(now, payload.sub, payload.sub)
    .run();
  return {
    ok: true,
    code: subscriber.enabled === 0 ? 'ALREADY_APPLIED' : 'STOPPED',
    action: payload.action,
    workspace_id: payload.ws,
    subscriber_id: payload.sub,
    watch_id: payload.watch,
  };
}

export async function processEmailActionToken({
  db,
  env,
  token,
  confirm = false,
  now = new Date().toISOString(),
}) {
  const verified = await verifyEmailActionToken({ token, env, now });
  if (!verified.ok) return verified;

  const action = getStandardEmailAction(verified.payload.action);
  if (action.kind === 'stop_watching' && !confirm) {
    return {
      ok: true,
      needs_confirmation: true,
      code: 'CONFIRM_STOP_WATCHING',
      payload: verified.payload,
    };
  }
  if (action.kind === 'stop_watching') {
    return applyStopWatchingAction({ db, payload: verified.payload, now });
  }
  if (action.kind === 'snooze') {
    return applySnoozeAction({ db, payload: verified.payload, now });
  }
  return { ok: false, code: 'INVALID_ACTION' };
}
