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

export async function signEventPayload({ connectorSecret, timestamp, rawBody }) {
  if (!connectorSecret) throw new Error('connectorSecret is required.');
  if (!timestamp) throw new Error('timestamp is required.');
  if (typeof rawBody !== 'string') throw new Error('rawBody must be a string.');
  return `sha256=${await hmacHex(connectorSecret, `${timestamp}.${rawBody}`)}`;
}

export async function signedEventHeaders({ connectorSecret, timestamp, rawBody }) {
  return {
    'Content-Type': 'application/json',
    'X-HeadsUp-Timestamp': timestamp,
    'X-HeadsUp-Signature': await signEventPayload({ connectorSecret, timestamp, rawBody }),
  };
}
