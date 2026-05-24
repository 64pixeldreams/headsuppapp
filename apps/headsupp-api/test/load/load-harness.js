import { foldAggregateDeltas } from '../../src/services/aggregation/fold-deltas.js';
import { eventToAggregateDeltas } from '../../src/services/aggregation/buckets.js';
import { createRawEventMessages } from '../../src/services/ingest/raw-event-queue.js';

export function generateSyntheticEvents({ count, signalKey = 'forecast.pace', startAt = '2026-05-24T00:00:00.000Z' }) {
  const start = Date.parse(startAt);
  return Array.from({ length: count }, (_, index) => ({
    idempotency_key: `load_event_${index}`,
    signal_key: signalKey,
    occurred_at: new Date(start + index * 1000).toISOString(),
    value: { num: index % 100 },
    fields: { shard: String(index % 10) },
  }));
}

export function summarizeLoadSmoke({ count = 1000 } = {}) {
  const connector = {
    workspace_id: 'ws_load',
    channel_id: 'ch_load',
    source_app: 'load_test',
    external_tenant_id: 'tenant_load',
    external_user_id: 'user_load',
  };
  const contract = {
    buckets: ['minute', 'hour'],
    dimensions: ['shard'],
  };
  const events = generateSyntheticEvents({ count });
  const messages = createRawEventMessages({ connector, events, receivedAt: '2026-05-24T01:00:00.000Z' });
  const deltas = messages.flatMap((message) =>
    eventToAggregateDeltas({
      message,
      signal: { id: 'sig_load', signal_key: message.event.signal_key },
      contract: { default_bucket_types: contract.buckets, dimensions: contract.dimensions },
    }),
  );
  const folded = foldAggregateDeltas(deltas);

  return {
    input_events: events.length,
    queue_messages: messages.length,
    aggregate_deltas: deltas.length,
    folded_deltas: folded.length,
    unique_idempotency_keys: new Set(events.map((event) => event.idempotency_key)).size,
  };
}
