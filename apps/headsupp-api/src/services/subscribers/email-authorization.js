import { dispatchSubscriberLifecycleEvent } from '../delivery/subscriber-lifecycle.js';
import { sendEmail } from '../email/send-email.js';

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
    env.HEADSUPP_EMAIL_AUTH_SECRET,
    env.HEADSUPP_EMAIL_AUTH_SECRET_PREVIOUS,
    env.HEADSUPP_EMAIL_ACTION_SECRET,
    env.HEADSUPP_UNSUBSCRIBE_SECRET,
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

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeAuthorizationConfig(config = {}, now = new Date().toISOString()) {
  const authorization = config.authorization && typeof config.authorization === 'object' ? config.authorization : {};
  if (authorization.required !== true) return { config, required: false };
  return {
    required: true,
    config: {
      ...config,
      authorization: {
        ...authorization,
        required: true,
        status: authorization.status || 'pending',
        requested_at: authorization.requested_at || now,
        authorized_at: authorization.authorized_at || null,
      },
    },
  };
}

export async function createEmailAuthorizationToken({
  env,
  subscriberId,
  workspaceId,
  channelId,
  now = new Date().toISOString(),
  ttlSeconds = Number(env?.HEADSUPP_EMAIL_AUTH_TTL_SECONDS || 60 * 60 * 24 * 7),
}) {
  const [secret] = getSecrets(env);
  if (!secret || !subscriberId || !workspaceId || !channelId) return null;
  const issuedAt = Math.floor(Date.parse(now) / 1000);
  const expiresAt = issuedAt + Math.max(60, Number(ttlSeconds) || 60);
  const payload = {
    sub: subscriberId,
    ws: workspaceId,
    ch: channelId,
    iat: issuedAt,
    exp: expiresAt,
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await signTokenPart(secret, payloadPart);
  return `${payloadPart}.${signature}`;
}

export async function verifyEmailAuthorizationToken({ token, env, now = new Date().toISOString() }) {
  const [payloadPart, signature] = String(token || '').split('.');
  if (!payloadPart || !signature) return { ok: false, code: 'INVALID_TOKEN' };
  const payload = parsePayload(payloadPart);
  if (!payload || !payload.sub || !payload.ws || !payload.ch || !payload.exp) {
    return { ok: false, code: 'INVALID_TOKEN' };
  }
  if (Number(payload.exp) < Math.floor(Date.parse(now) / 1000)) return { ok: false, code: 'EXPIRED_TOKEN' };
  const secrets = getSecrets(env);
  if (secrets.length === 0) return { ok: false, code: 'EMAIL_AUTH_NOT_CONFIGURED' };
  for (const secret of secrets) {
    const expected = await signTokenPart(secret, payloadPart);
    if (expected === signature) return { ok: true, payload };
  }
  return { ok: false, code: 'INVALID_TOKEN' };
}

export function buildEmailAuthorizationUrl({ token, env }) {
  if (!token) return null;
  const root = String(env?.HEADSUPP_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!root) return null;
  const url = new URL(`${root}/v1/subscribers/confirm`);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function sendAuthorizationEmail({
  env,
  subscriber,
  now = new Date().toISOString(),
  sendEmailFn = sendEmail,
}) {
  if (subscriber.subscriber_type !== 'email') return { ok: true, skipped: true };
  const config = parseJson(subscriber.config_json, {});
  if (config.authorization?.required !== true || config.authorization?.status !== 'pending') {
    return { ok: true, skipped: true };
  }
  const token = await createEmailAuthorizationToken({
    env,
    subscriberId: subscriber.id || subscriber.subscriber_id,
    workspaceId: subscriber.workspace_id,
    channelId: subscriber.channel_id,
    now,
    ttlSeconds: config.authorization.ttl_seconds,
  });
  const confirmUrl = buildEmailAuthorizationUrl({ token, env });
  if (!confirmUrl) return { ok: false, code: 'EMAIL_AUTH_LINK_NOT_CONFIGURED' };
  const brand = config.branding?.brand_name || 'Heads Up';
  const from = config.from || { email: env.HEADSUPP_EMAIL_FROM || 'alerts@headsupp.io', name: brand };
  const replyTo = config.reply_to || env.HEADSUPP_EMAIL_REPLY_TO || from.email;
  await sendEmailFn({
    env,
    message: {
      from,
      to: [subscriber.destination_url],
      reply_to: { email: replyTo },
      subject: `${brand}: confirm your alert subscription`,
      text: `Confirm your alert subscription:\n\n${confirmUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111827;"><h1>Confirm your alert subscription</h1><p>Click the button below to start receiving these alerts.</p><p><a href="${confirmUrl}" style="display:inline-block;background:#111827;color:#ffffff;padding:12px 16px;border-radius:8px;text-decoration:none;font-weight:700;">Confirm subscription</a></p><p style="color:#6b7280;font-size:12px;">If you did not request this, you can ignore this email.</p></body></html>`,
    },
  });
  return { ok: true, confirmation_url: confirmUrl };
}

export async function processEmailAuthorizationToken({ db, env, token, now = new Date().toISOString() }) {
  const verified = await verifyEmailAuthorizationToken({ token, env, now });
  if (!verified.ok) return verified;
  const subscriber = await db
    .prepare('SELECT * FROM subscribers WHERE (id = ? OR subscriber_id = ?) AND workspace_id = ? AND channel_id = ? LIMIT 1')
    .bind(verified.payload.sub, verified.payload.sub, verified.payload.ws, verified.payload.ch)
    .first();
  if (!subscriber) return { ok: false, code: 'SUBSCRIBER_NOT_FOUND' };
  const config = parseJson(subscriber.config_json, {});
  if (config.authorization?.status === 'authorized' || subscriber.enabled === 1) {
    return {
      ok: true,
      code: 'ALREADY_CONFIRMED',
      subscriber_id: subscriber.subscriber_id || subscriber.id,
      workspace_id: subscriber.workspace_id,
      channel_id: subscriber.channel_id,
    };
  }
  const nextConfig = {
    ...config,
    authorization: {
      ...(config.authorization || {}),
      required: true,
      status: 'authorized',
      authorized_at: now,
    },
  };
  await db
    .prepare('UPDATE subscribers SET enabled = 1, config_json = ?, updated_at = ? WHERE id = ? OR subscriber_id = ?')
    .bind(JSON.stringify(nextConfig), now, subscriber.id || subscriber.subscriber_id, subscriber.subscriber_id || subscriber.id)
    .run();

  const updatedSubscriber = {
    ...subscriber,
    enabled: 1,
    config_json: JSON.stringify(nextConfig),
    updated_at: now,
  };
  await dispatchSubscriberLifecycleEvent({
    db,
    env,
    event: 'subscriber.authorized',
    subscriber: updatedSubscriber,
    now,
  }).catch(() => {});

  return {
    ok: true,
    code: 'CONFIRMED',
    subscriber_id: subscriber.subscriber_id || subscriber.id,
    workspace_id: subscriber.workspace_id,
    channel_id: subscriber.channel_id,
  };
}
