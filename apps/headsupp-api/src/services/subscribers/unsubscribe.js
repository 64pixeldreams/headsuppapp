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
  return [env.HEADSUPP_UNSUBSCRIBE_SECRET, env.HEADSUPP_UNSUBSCRIBE_SECRET_PREVIOUS].filter(Boolean);
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

export async function createUnsubscribeToken({
  env,
  subscriberId,
  channelId,
  mode,
  now = new Date().toISOString(),
  ttlSeconds = Number(env?.HEADSUPP_UNSUBSCRIBE_TTL_SECONDS || 60 * 60 * 24 * 7),
}) {
  const [secret] = getSecrets(env);
  if (!secret || !subscriberId) return null;

  const expiresAt = Math.floor(Date.parse(now) / 1000) + Math.max(60, Number(ttlSeconds) || 60);
  const payload = {
    sub: subscriberId,
    ch: channelId || null,
    mode: mode || null,
    exp: expiresAt,
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await signTokenPart(secret, payloadPart);
  return `${payloadPart}.${signature}`;
}

export async function verifyUnsubscribeToken({ token, env, now = new Date().toISOString() }) {
  const [payloadPart, signature] = String(token || '').split('.');
  if (!payloadPart || !signature) {
    return { ok: false, code: 'INVALID_TOKEN' };
  }

  const payload = parsePayload(payloadPart);
  if (!payload || !payload.sub || !payload.exp) {
    return { ok: false, code: 'INVALID_TOKEN' };
  }

  const nowSeconds = Math.floor(Date.parse(now) / 1000);
  if (Number(payload.exp) < nowSeconds) {
    return { ok: false, code: 'EXPIRED_TOKEN' };
  }

  const secrets = getSecrets(env);
  if (secrets.length === 0) {
    return { ok: false, code: 'UNSUBSCRIBE_NOT_CONFIGURED' };
  }

  for (const secret of secrets) {
    const expected = await signTokenPart(secret, payloadPart);
    if (expected === signature) {
      return { ok: true, payload };
    }
  }
  return { ok: false, code: 'INVALID_TOKEN' };
}

export function buildUnsubscribeUrl({ token, env }) {
  if (!token) return null;
  const root = String(env?.HEADSUPP_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!root) return null;
  return `${root}/v1/subscribers/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function processUnsubscribeToken({ db, env, token, now = new Date().toISOString() }) {
  const verified = await verifyUnsubscribeToken({ token, env, now });
  if (!verified.ok) return verified;
  const subscriberId = verified.payload.sub;
  const subscriber = await db
    .prepare('SELECT * FROM subscribers WHERE id = ? OR subscriber_id = ? LIMIT 1')
    .bind(subscriberId, subscriberId)
    .first();
  if (!subscriber) {
    return { ok: false, code: 'SUBSCRIBER_NOT_FOUND' };
  }

  await db
    .prepare('UPDATE subscribers SET enabled = 0, updated_at = ? WHERE id = ? OR subscriber_id = ?')
    .bind(now, subscriber.id || subscriber.subscriber_id, subscriber.subscriber_id || subscriber.id)
    .run();

  return {
    ok: true,
    subscriber_id: subscriber.subscriber_id || subscriber.id,
    workspace_id: subscriber.workspace_id,
    channel_id: subscriber.channel_id,
    mode: subscriber.mode,
    changed: subscriber.enabled === 0 ? false : true,
  };
}
