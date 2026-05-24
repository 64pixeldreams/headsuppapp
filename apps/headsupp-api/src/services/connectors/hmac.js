const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
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

export async function signConnectorPayload({ secret, timestamp, rawBody }) {
  return `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export async function verifyConnectorHmac({
  connector,
  timestamp,
  signature,
  rawBody,
  nowMs = Date.now(),
  maxSkewMs = DEFAULT_MAX_SKEW_MS,
}) {
  if (!connector) {
    return {
      ok: false,
      status: 404,
      code: 'CONNECTOR_NOT_FOUND',
      message: 'Connector was not found.',
    };
  }

  if (!connector.enabled) {
    return {
      ok: false,
      status: 403,
      code: 'CONNECTOR_DISABLED',
      message: 'Connector is disabled.',
    };
  }

  if (!timestamp || !signature) {
    return {
      ok: false,
      status: 401,
      code: 'MISSING_HMAC_HEADERS',
      message: 'X-HeadsUp-Timestamp and X-HeadsUp-Signature are required.',
    };
  }

  const requestMs = Date.parse(timestamp);
  if (!Number.isFinite(requestMs) || Math.abs(nowMs - requestMs) > maxSkewMs) {
    return {
      ok: false,
      status: 401,
      code: 'STALE_HMAC_TIMESTAMP',
      message: 'X-HeadsUp-Timestamp is outside the allowed skew window.',
    };
  }

  const actualHex = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : '';
  const expectedHex = (await signConnectorPayload({ secret: connector.connector_secret, timestamp, rawBody })).slice(
    'sha256='.length,
  );

  if (!constantTimeEqual(hexToBytes(actualHex), hexToBytes(expectedHex))) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_HMAC_SIGNATURE',
      message: 'X-HeadsUp-Signature is invalid.',
    };
  }

  return {
    ok: true,
    connector,
  };
}
