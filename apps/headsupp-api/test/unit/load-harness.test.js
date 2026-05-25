import assert from 'node:assert/strict';
import test from 'node:test';

import { generateSyntheticEvents, summarizeLoadSmoke } from '../load/load-harness.js';

test('generates deterministic synthetic load events', () => {
  const events = generateSyntheticEvents({ count: 10 });

  assert.equal(events.length, 10);
  assert.equal(events[0].idempotency_key, 'load_event_0');
  assert.equal(new Set(events.map((event) => event.idempotency_key)).size, 10);
});

test('load smoke summary proves queue and fold invariants', () => {
  const summary = summarizeLoadSmoke({ count: 1000 });

  assert.equal(summary.input_events, 1000);
  assert.equal(summary.queue_messages, 1000);
  assert.equal(summary.unique_idempotency_keys, 1000);
  assert.ok(summary.folded_deltas < summary.aggregate_deltas);
});

test('high-volume smoke summary can exceed normal load smoke size', () => {
  const summary = summarizeLoadSmoke({ count: 20000 });

  assert.equal(summary.input_events, 20000);
  assert.equal(summary.queue_messages, 20000);
  assert.equal(summary.unique_idempotency_keys, 20000);
  assert.ok(summary.folded_deltas < summary.aggregate_deltas);
});
