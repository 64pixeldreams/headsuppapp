const SIGNATURE_PREFIX = 'sha256=';
const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!/^[a-f0-9]+$/i.test(hex || '') || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

export async function hmacHex(secret, message) {
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

export async function signEmailWorkerPayload({ secret, timestamp, rawBody }) {
  return `${SIGNATURE_PREFIX}${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export async function verifyEmailWorkerSignature({
  secret,
  timestamp,
  signature,
  rawBody,
  nowMs = Date.now(),
  maxSkewMs = DEFAULT_MAX_SKEW_MS,
}) {
  if (!secret) return { ok: false, status: 501, code: 'EMAIL_WORKER_SECRET_NOT_CONFIGURED' };
  if (!timestamp || !signature) return { ok: false, status: 401, code: 'MISSING_EMAIL_WORKER_HMAC_HEADERS' };
  const requestMs = Date.parse(timestamp);
  if (!Number.isFinite(requestMs) || Math.abs(nowMs - requestMs) > maxSkewMs) {
    return { ok: false, status: 401, code: 'STALE_EMAIL_WORKER_HMAC_TIMESTAMP' };
  }
  const actualHex = signature.startsWith(SIGNATURE_PREFIX) ? signature.slice(SIGNATURE_PREFIX.length) : '';
  const expectedHex = (await signEmailWorkerPayload({ secret, timestamp, rawBody })).slice(SIGNATURE_PREFIX.length);
  if (!constantTimeEqual(hexToBytes(actualHex), hexToBytes(expectedHex))) {
    return { ok: false, status: 401, code: 'INVALID_EMAIL_WORKER_HMAC_SIGNATURE' };
  }
  return { ok: true };
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function numbersEqual(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return Math.abs(leftNumber - rightNumber) < 0.000001;
  return left === right;
}

function validatePayload(expected, received) {
  const failures = [];
  for (const key of ['run_id', 'case_id', 'watch_type', 'signal_key', 'severity']) {
    if (expected?.[key] !== undefined && expected[key] !== received?.[key]) failures.push(`${key} mismatch`);
  }
  for (const key of ['current_value', 'threshold_value']) {
    if (expected?.[key] !== undefined && !numbersEqual(expected[key], received?.[key])) failures.push(`${key} mismatch`);
  }
  if (expected?.alert_id && expected.alert_id !== received?.alert_id) failures.push('alert_id mismatch');
  if (expected?.delivery_id && expected.delivery_id !== received?.delivery_id) failures.push('delivery_id mismatch');
  return failures;
}

export function buildEmailTestPayload({ alert, delivery, subscriber, emailTest = {}, now = new Date().toISOString() }) {
  const caseConfig = emailTest.cases_by_watch_id?.[alert.watch_id] || {};
  const expected = {
    test: true,
    run_id: caseConfig.run_id || emailTest.run_id,
    case_id: caseConfig.case_id || emailTest.case_id || alert.watch_id,
    watch_type: caseConfig.watch_type || emailTest.watch_type,
    signal_key: caseConfig.signal_key || emailTest.signal_key,
    current_value: alert.current_value,
    threshold_value: alert.threshold_value,
    severity: alert.severity,
    alert_id: alert.id,
    delivery_id: delivery.id,
    expected: {
      current_value: alert.current_value,
      threshold_value: alert.threshold_value,
      severity: alert.severity,
    },
    sent_at: now,
  };
  return {
    id: `email_test_${delivery.id}`,
    recipient: subscriber.destination_url,
    expected,
  };
}

export function emailTestText(payload) {
  return [
    'HEADSUPP_EMAIL_TEST_JSON_BEGIN',
    JSON.stringify(payload, null, 2),
    'HEADSUPP_EMAIL_TEST_JSON_END',
  ].join('\n');
}

export async function recordEmailTestSent({ db, message, providerMessageId = null, now = new Date().toISOString() }) {
  await db
    .prepare(
      `INSERT INTO email_test_messages (
        id, run_id, case_id, alert_id, delivery_id, recipient, expected_json, received_json, status,
        sent_at, received_at, tested_at, failure_reason, provider_message_id, inbound_message_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        expected_json = excluded.expected_json,
        status = excluded.status,
        sent_at = excluded.sent_at,
        provider_message_id = excluded.provider_message_id,
        updated_at = excluded.updated_at`,
    )
    .bind(
      message.id,
      message.expected.run_id,
      message.expected.case_id,
      message.expected.alert_id,
      message.expected.delivery_id,
      message.recipient,
      JSON.stringify(message.expected),
      null,
      'sent',
      now,
      null,
      null,
      null,
      providerMessageId,
      null,
      now,
      now,
    )
    .run();
}

export async function processEmailTestReceipt({ db, receipt, now = new Date().toISOString() }) {
  const payload = receipt?.payload || {};
  const deliveryId = payload.delivery_id;
  const row = deliveryId
    ? await db.prepare('SELECT * FROM email_test_messages WHERE delivery_id = ? LIMIT 1').bind(deliveryId).first()
    : null;
  if (!row) {
    return { ok: false, status: 404, code: 'EMAIL_TEST_MESSAGE_NOT_FOUND', message: 'Email test message was not found.' };
  }
  const expected = parseJson(row.expected_json, {});
  const failures = validatePayload(expected, payload);
  const status = failures.length ? 'failed' : 'tested';
  const failureReason = failures.length ? failures.join('; ') : null;
  await db
    .prepare(
      `UPDATE email_test_messages
       SET received_json = ?, status = ?, received_at = ?, tested_at = ?, failure_reason = ?,
           inbound_message_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      JSON.stringify(receipt),
      status,
      receipt.received_at || now,
      status === 'tested' ? now : null,
      failureReason,
      receipt.message_id || null,
      now,
      row.id,
    )
    .run();
  return { ok: status === 'tested', status: 200, code: status === 'tested' ? 'EMAIL_TESTED' : 'EMAIL_TEST_FAILED', message_id: row.id, failure_reason: failureReason };
}
