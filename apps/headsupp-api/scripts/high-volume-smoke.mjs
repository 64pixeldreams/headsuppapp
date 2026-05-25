import { summarizeLoadSmoke } from '../test/load/load-harness.js';

const defaultCount = 100000;
const count = Number(process.env.HEADSUPP_HIGH_VOLUME_EVENT_COUNT || defaultCount);

if (!Number.isInteger(count) || count <= 10000) {
  throw new Error('HEADSUPP_HIGH_VOLUME_EVENT_COUNT must be an integer greater than 10000.');
}

const startedAt = Date.now();
const summary = summarizeLoadSmoke({ count });
const elapsedMs = Date.now() - startedAt;

if (summary.input_events !== count) {
  throw new Error(`Expected ${count} events, got ${summary.input_events}`);
}
if (summary.queue_messages !== count) {
  throw new Error(`Expected ${count} queue messages, got ${summary.queue_messages}`);
}
if (summary.unique_idempotency_keys !== count) {
  throw new Error('Synthetic high-volume events must be uniquely dedupable');
}
if (summary.folded_deltas >= summary.aggregate_deltas) {
  throw new Error('Folded deltas should compress raw aggregate deltas');
}

console.log(JSON.stringify({ ok: true, elapsed_ms: elapsedMs, summary }, null, 2));
