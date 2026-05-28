const JSON_BEGIN = 'HEADSUPP_EMAIL_TEST_JSON_BEGIN';
const JSON_END = 'HEADSUPP_EMAIL_TEST_JSON_END';

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(signature);
}

async function signedFetch(url, payload, secret, fetchFn = fetch) {
  const rawBody = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
  return fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HeadsUp-Timestamp': timestamp,
      'X-HeadsUp-Signature': signature,
    },
    body: rawBody,
  });
}

function normalizeRawEmail(raw) {
  return String(raw || '')
    .replace(/=\r?\n/g, '')
    .replace(/=3D/g, '=')
    .replace(/\r\n/g, '\n');
}

function extractJsonPayload(raw) {
  const normalized = normalizeRawEmail(raw);
  const start = normalized.indexOf(JSON_BEGIN);
  const end = normalized.indexOf(JSON_END, start + JSON_BEGIN.length);
  if (start < 0 || end < 0) return null;
  const jsonText = normalized.slice(start + JSON_BEGIN.length, end).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function readRawMessage(message) {
  if (!message.raw) return '';
  if (typeof message.raw === 'string') return message.raw;
  return new Response(message.raw).text();
}

function header(message, name) {
  return message.headers?.get?.(name) || null;
}

export async function handleEmail(message, env, ctx, { fetchFn = fetch } = {}) {
  const allowedAddress = String(env.HEADSUPP_EMAIL_TEST_ADDRESS || 'tester@aibox.headsupp.io').toLowerCase();
  const to = String(message.to || '').toLowerCase();
  if (to !== allowedAddress) {
    message.setReject?.('Unknown address');
    return { ok: false, code: 'UNKNOWN_ADDRESS' };
  }

  const raw = await readRawMessage(message);
  const payload = extractJsonPayload(raw);
  if (!payload?.delivery_id) {
    message.setReject?.('Missing Heads Up email test payload');
    return { ok: false, code: 'MISSING_TEST_PAYLOAD' };
  }

  const secret = env.HEADSUPP_EMAIL_WORKER_WEBHOOK_SECRET;
  if (!secret) {
    message.setReject?.('Email worker webhook secret is not configured');
    return { ok: false, code: 'SECRET_NOT_CONFIGURED' };
  }

  const endpoint = `${String(env.HEADSUPP_API_URL || 'https://api.headsupp.io').replace(/\/$/, '')}/internal/email/test-receipts`;
  const receipt = {
    message_id: header(message, 'Message-ID'),
    from: message.from || null,
    to: message.to || null,
    subject: header(message, 'subject'),
    received_at: new Date().toISOString(),
    payload,
  };

  const response = await signedFetch(endpoint, receipt, secret, fetchFn);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Heads Up receipt failed: ${response.status} ${body.slice(0, 200)}`);
  }
  return { ok: true, code: 'RECEIPT_RECORDED' };
}

export default {
  async email(message, env, ctx) {
    ctx.waitUntil(handleEmail(message, env, ctx));
  },
};
