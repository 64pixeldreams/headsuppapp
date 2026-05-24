import assert from 'node:assert/strict';
import test from 'node:test';

import { signConnectorPayload, verifyConnectorHmac } from '../../src/services/connectors/hmac.js';

const connector = {
  connector_key: 'ck_test',
  connector_secret: 'hu_sec_test_secret',
  enabled: true,
};

const timestamp = '2026-05-24T10:00:00.000Z';
const rawBody = '{"idempotency_key":"evt_1"}';
const nowMs = Date.parse(timestamp);

test('signs connector payload with sha256 prefix', async () => {
  const signature = await signConnectorPayload({
    secret: connector.connector_secret,
    timestamp,
    rawBody,
  });

  assert.match(signature, /^sha256=[a-f0-9]{64}$/);
});

test('verifies valid connector HMAC signature', async () => {
  const signature = await signConnectorPayload({
    secret: connector.connector_secret,
    timestamp,
    rawBody,
  });

  const result = await verifyConnectorHmac({
    connector,
    timestamp,
    signature,
    rawBody,
    nowMs,
  });

  assert.equal(result.ok, true);
  assert.equal(result.connector.connector_key, 'ck_test');
});

test('rejects stale connector HMAC timestamp', async () => {
  const signature = await signConnectorPayload({
    secret: connector.connector_secret,
    timestamp,
    rawBody,
  });

  const result = await verifyConnectorHmac({
    connector,
    timestamp,
    signature,
    rawBody,
    nowMs: nowMs + 301_000,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'STALE_HMAC_TIMESTAMP');
});

test('rejects invalid connector HMAC signature', async () => {
  const result = await verifyConnectorHmac({
    connector,
    timestamp,
    signature: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
    rawBody,
    nowMs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_HMAC_SIGNATURE');
});

test('rejects disabled connector', async () => {
  const result = await verifyConnectorHmac({
    connector: { ...connector, enabled: false },
    timestamp,
    signature: 'sha256=ignored',
    rawBody,
    nowMs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'CONNECTOR_DISABLED');
});
