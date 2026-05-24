import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDeliveryResult, nextRetryAt } from '../../src/services/delivery/backoff.js';

const now = '2026-05-24T10:00:00.000Z';

test('marks 2xx delivery as sent', () => {
  const state = classifyDeliveryResult({ responseStatus: 204, previousAttemptCount: 0, now });

  assert.equal(state.status, 'sent');
  assert.equal(state.attempt_count, 1);
  assert.equal(state.next_retry_at, null);
});

test('retries 429 with backoff', () => {
  const state = classifyDeliveryResult({ responseStatus: 429, previousAttemptCount: 0, now });

  assert.equal(state.status, 'retrying');
  assert.equal(state.attempt_count, 1);
  assert.equal(state.next_retry_at, '2026-05-24T10:01:00.000Z');
});

test('retries 5xx with later backoff', () => {
  const state = classifyDeliveryResult({ responseStatus: 500, previousAttemptCount: 2, now });

  assert.equal(state.status, 'retrying');
  assert.equal(state.next_retry_at, '2026-05-24T10:15:00.000Z');
});

test('permanently fails configured 4xx responses', () => {
  const state = classifyDeliveryResult({ responseStatus: 404, previousAttemptCount: 0, now });

  assert.equal(state.status, 'failed');
  assert.equal(state.next_retry_at, null);
});

test('fails after max retry attempts', () => {
  const state = classifyDeliveryResult({ responseStatus: 500, previousAttemptCount: 5, now });

  assert.equal(state.status, 'failed');
});

test('calculates retry timestamp by attempt count', () => {
  assert.equal(nextRetryAt(now, 4), '2026-05-24T11:00:00.000Z');
});
