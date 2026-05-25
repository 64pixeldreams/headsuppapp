import assert from 'node:assert/strict';
import test from 'node:test';

import { signedEventHeaders, signEventPayload } from '../src/index.js';

test('signs event payloads with connector HMAC format', async () => {
  const signature = await signEventPayload({
    connectorSecret: 'hu_sec_test',
    timestamp: '2026-05-25T12:00:00.000Z',
    rawBody: '{"ok":true}',
  });

  assert.match(signature, /^sha256=[a-f0-9]{64}$/);
});

test('builds ingest headers', async () => {
  const headers = await signedEventHeaders({
    connectorSecret: 'hu_sec_test',
    timestamp: '2026-05-25T12:00:00.000Z',
    rawBody: '{"ok":true}',
  });

  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['X-HeadsUp-Timestamp'], '2026-05-25T12:00:00.000Z');
  assert.match(headers['X-HeadsUp-Signature'], /^sha256=[a-f0-9]{64}$/);
});
