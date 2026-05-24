function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(signature);
}

function readSigningSecret(subscriber, env) {
  try {
    const config = subscriber?.config_json ? JSON.parse(subscriber.config_json) : {};
    if (typeof config.signing_secret === 'string' && config.signing_secret.trim()) return config.signing_secret.trim();
  } catch {
    // Ignore malformed config; fall back to env secret.
  }
  return env?.OUTBOUND_WEBHOOK_SIGNING_SECRET || null;
}

export async function buildSignedWebhookHeaders({ body, deliveryId, subscriber, env, timestamp = Math.floor(Date.now() / 1000) }) {
  const secret = readSigningSecret(subscriber, env);
  if (!secret) return {};
  const ts = String(timestamp);
  const signature = await hmacSha256Hex(secret, `${ts}.${body}`);
  return {
    'X-HeadsUp-Timestamp': ts,
    'X-HeadsUp-Signature': `v1=${signature}`,
    'X-HeadsUp-Delivery-Id': deliveryId,
  };
}
