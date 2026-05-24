import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAggregateForwardPayload, bucketEndAt } from '../../src/services/aggregate-forward/payload.js';
import { createAggregateDelivery, enqueueAggregateDeliveries } from '../../src/services/aggregate-forward/delivery.js';

const aggregate = {
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_123',
  bucket_type: 'hour',
  bucket_start_at: '2026-05-24T10:00:00.000Z',
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
    channel: { channel_id: 'ch_123' },
  });

  assert.equal(payload.event_type, 'aggregate_bucket_closed');
  assert.equal(payload.bucket.end_at, '2026-05-24T11:00:00.000Z');
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
    channel: { channel_id: 'ch_123' },
    subscriber: { subscriber_id: 'sub_123' },
    now: '2026-05-24T11:01:00.000Z',
  });

  assert.equal(delivery.status, 'pending');
  assert.equal(JSON.parse(delivery.payload_json).values.count, 7);
  assert.equal(JSON.parse(delivery.payload_json).delivery_id, delivery.id);
  assert.match(calls[0].sql, /INSERT OR IGNORE INTO aggregate_deliveries/);
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
