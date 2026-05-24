import { summarizeLoadSmoke } from '../test/load/load-harness.js';

const durationSeconds = Number(process.env.HEADSUPP_SOAK_DURATION_SECONDS || 60);
const intervalMs = Number(process.env.HEADSUPP_SOAK_INTERVAL_MS || 5000);
const eventsPerTick = Number(process.env.HEADSUPP_SOAK_EVENTS_PER_TICK || 1500);
const startedAt = Date.now();

if (durationSeconds <= 0 || intervalMs <= 0 || eventsPerTick <= 0) {
  throw new Error('HEADSUPP_SOAK_* settings must be positive numbers.');
}

const ticks = Math.max(1, Math.ceil((durationSeconds * 1000) / intervalMs));
const snapshots = [];
let totalEvents = 0;

for (let tick = 0; tick < ticks; tick += 1) {
  const summary = summarizeLoadSmoke({ count: eventsPerTick });
  snapshots.push(summary);
  totalEvents += summary.input_events;

  if (summary.unique_idempotency_keys !== eventsPerTick) {
    throw new Error(`Tick ${tick + 1} had duplicate idempotency keys.`);
  }
  if (summary.folded_deltas >= summary.aggregate_deltas) {
    throw new Error(`Tick ${tick + 1} failed fold compression invariant.`);
  }

  if (tick + 1 < ticks) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const elapsedMs = Date.now() - startedAt;
const aggregateDeltas = snapshots.reduce((sum, row) => sum + row.aggregate_deltas, 0);
const foldedDeltas = snapshots.reduce((sum, row) => sum + row.folded_deltas, 0);
const queueMessages = snapshots.reduce((sum, row) => sum + row.queue_messages, 0);
const throughputEventsPerSecond = Number((totalEvents / Math.max(elapsedMs, 1) * 1000).toFixed(2));

console.log(
  JSON.stringify(
    {
      ok: true,
      soak: {
        duration_seconds: durationSeconds,
        interval_ms: intervalMs,
        ticks,
        events_per_tick: eventsPerTick,
        elapsed_ms: elapsedMs,
      },
      summary: {
        total_events: totalEvents,
        queue_messages: queueMessages,
        aggregate_deltas: aggregateDeltas,
        folded_deltas: foldedDeltas,
        fold_compression_ratio: Number((foldedDeltas / Math.max(aggregateDeltas, 1)).toFixed(4)),
        throughput_events_per_second: throughputEventsPerSecond,
      },
    },
    null,
    2,
  ),
);
