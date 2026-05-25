import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAggregateForwardPayload, bucketEndAt } from '../../src/services/aggregate-forward/payload.js';
import { createAggregateDelivery, enqueueAggregateDeliveries } from '../../src/services/aggregate-forward/delivery.js';
import { evaluateAggregateForwardWatch } from '../../src/services/aggregate-forward/evaluator.js';

const aggregate = {
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_123',
  bucket_type: 'hour',
  bucket_start_at: '2026-05-24T10:00:00.000Z',
  dimensions_hash: 'h123',
  dimensions_json: JSON.stringify({ forecast_id: 'fc_123' }),
  last_event_context_json: JSON.stringify({
    cta: { label: 'View forecast', url: 'https://foretic.io/forecasts/fc_123' },
    fields: { forecast_id: 'fc_123', status: 'warning' },
  }),
  sum_value: 98,
  count_value: 7,
  avg_value: 14,
  min_value: 4,
  max_value: 21,
  last_value: 4,
};

test('builds aggregate-forward payload for closed bucket', () => {
  const payload = buildAggregateForwardPayload({
    aggregate,
    signal: { signal_key: 'oxygen.percent' },
    channel: { channel_id: 'ch_123', metadata_json: '{"forecast_id":"fc_123"}' },
  });

  assert.equal(payload.event_type, 'aggregate_bucket_closed');
  assert.equal(payload.bucket.end_at, '2026-05-24T11:00:00.000Z');
  assert.equal(payload.dimensions_hash, 'h123');
  assert.equal(payload.dimensions.forecast_id, 'fc_123');
  assert.equal(payload.channel_metadata.forecast_id, 'fc_123');
  assert.equal(payload.fields.status, 'warning');
  assert.equal(payload.cta.url, 'https://foretic.io/forecasts/fc_123');
  assert.equal(payload.values.avg, 14);
  assert.equal(bucketEndAt('2026-05-24T10:00:00.000Z', 'minute'), '2026-05-24T10:01:00.000Z');
});

test('creates aggregate delivery row with stable payload', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return { async run() { return { meta: { changes: 1 } }; } };
        },
      };
    },
  };

  const delivery = await createAggregateDelivery({
    db,
    aggregate,
    signal: { signal_key: 'oxygen.percent' },
    channel: { channel_id: 'ch_123', metadata_json: '{"forecast_id":"fc_123"}' },
    subscriber: { subscriber_id: 'sub_123' },
    now: '2026-05-24T11:01:00.000Z',
  });

  assert.equal(delivery.status, 'pending');
  assert.equal(JSON.parse(delivery.payload_json).values.count, 7);
  assert.equal(JSON.parse(delivery.payload_json).channel_metadata.forecast_id, 'fc_123');
  assert.equal(JSON.parse(delivery.payload_json).dedupe_key, 'sub_123:sig_123:hour:2026-05-24T10:00:00.000Z:h123');
  assert.equal(JSON.parse(delivery.payload_json).delivery_id, delivery.id);
  assert.equal(delivery.dimensions_hash, 'h123');
  assert.match(calls[0].sql, /INSERT OR IGNORE INTO aggregate_deliveries/);
});

test('marks aggregate delivery as not inserted when D1 reports no changes', async () => {
  const db = {
    prepare() {
      return {
        bind() {
          return { async run() { return { meta: { changes: 0 } }; } };
        },
      };
    },
  };
  const delivery = await createAggregateDelivery({
    db,
    aggregate,
    signal: { signal_key: 'oxygen.percent' },
    channel: { channel_id: 'ch_123', metadata_json: '{"forecast_id":"fc_123"}' },
    subscriber: { subscriber_id: 'sub_123' },
    now: '2026-05-24T11:01:00.000Z',
  });

  assert.equal(delivery.inserted, false);
});

test('enqueues aggregate delivery messages', async () => {
  const batches = [];
  const queued = await enqueueAggregateDeliveries(
    { async sendBatch(batch) { batches.push(batch); } },
    [{ id: 'aggdel_123' }],
  );

  assert.equal(queued, 1);
  assert.equal(batches[0][0].body.aggregateDeliveryId, 'aggdel_123');
});

test('does not enqueue aggregate delivery rows ignored as duplicates', async () => {
  const batches = [];
  const queued = await enqueueAggregateDeliveries(
    { async sendBatch(batch) { batches.push(batch); } },
    [{ id: 'aggdel_existing', inserted: false }],
  );

  assert.equal(queued, 0);
  assert.equal(batches.length, 0);
});

test('aggregate-forward evaluator queries dimension-filtered aggregates', async () => {
  const calls = [];
  const batches = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async all() {
              if (sql.includes('FROM aggregates')) return { results: [] };
              return { results: [] };
            },
            async first() {
              if (sql.includes('FROM subscribers')) return { id: 'sub_123', subscriber_id: 'sub_123' };
              if (sql.includes('FROM signals')) return { id: 'sig_123', signal_key: 'forecast.revenue.pace' };
              if (sql.includes('FROM channels')) return { id: 'ch_123', channel_id: 'ch_123' };
              return null;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  await evaluateAggregateForwardWatch({
    db,
    queue: { async sendBatch(batch) { batches.push(batch); } },
    watch: {
      id: 'watch_forward',
      signal_id: 'sig_123',
      channel_id: 'ch_123',
      config_json: JSON.stringify({
        subscriber_id: 'sub_123',
        bucket_type: 'hour',
        dimensions: { forecast_id: 'fc_123' },
      }),
    },
    now: '2026-05-24T12:05:00.000Z',
  });

  const aggregateCall = calls.find((call) => call.sql.includes('FROM aggregates'));
  assert.equal(aggregateCall.params[1], 'hour');
  assert.equal(typeof aggregateCall.params[3], 'string');
  assert.equal(aggregateCall.params[3], aggregateCall.params[4]);
});
