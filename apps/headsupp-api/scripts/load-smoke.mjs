import { summarizeLoadSmoke } from '../test/load/load-harness.js';

const count = Number(process.env.LOAD_EVENT_COUNT || 10000);
const summary = summarizeLoadSmoke({ count });

if (summary.input_events !== count) {
  throw new Error(`Expected ${count} events, got ${summary.input_events}`);
}
if (summary.queue_messages !== count) {
  throw new Error(`Expected ${count} queue messages, got ${summary.queue_messages}`);
}
if (summary.unique_idempotency_keys !== count) {
  throw new Error('Synthetic load events must be uniquely dedupable');
}
if (summary.folded_deltas >= summary.aggregate_deltas) {
  throw new Error('Folded deltas should compress raw aggregate deltas');
}

console.log(JSON.stringify({ ok: true, summary }, null, 2));
