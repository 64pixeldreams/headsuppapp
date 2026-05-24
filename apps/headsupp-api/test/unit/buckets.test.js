import assert from 'node:assert/strict';
import test from 'node:test';

import { bucketStartAt, eventToAggregateDeltas, extractDimensions } from '../../src/services/aggregation/buckets.js';

test('calculates UTC bucket starts', () => {
  const occurredAt = '2026-05-24T10:37:45.123Z';

  assert.equal(bucketStartAt(occurredAt, 'minute'), '2026-05-24T10:37:00.000Z');
  assert.equal(bucketStartAt(occurredAt, 'hour'), '2026-05-24T10:00:00.000Z');
  assert.equal(bucketStartAt(occurredAt, 'day'), '2026-05-24T00:00:00.000Z');
  assert.equal(bucketStartAt(occurredAt, 'month'), '2026-05-01T00:00:00.000Z');
});

test('extracts configured dimensions from event fields', () => {
  const dimensions = extractDimensions(
    {
      fields: {
        forecast_id: 'fc_123',
        status: 'critical',
      },
    },
    ['forecast_id', 'status', 'missing'],
  );

  assert.deepEqual(dimensions, {
    forecast_id: 'fc_123',
    status: 'critical',
    missing: null,
  });
});

test('converts event to aggregate deltas for configured buckets', () => {
  const deltas = eventToAggregateDeltas({
    message: {
      workspaceId: 'ws_123',
      channelId: 'ch_123',
      event: {
        signal_key: 'forecast.revenue.pace',
        occurred_at: '2026-05-24T10:37:45.123Z',
        value: { num: 64 },
        fields: { forecast_id: 'fc_123', status: 'critical' },
      },
    },
    signal: {
      id: 'sig_123',
      signal_key: 'forecast.revenue.pace',
    },
    contract: {
      dimensions: ['forecast_id', 'status'],
      default_bucket_types: ['minute', 'hour'],
    },
    now: '2026-05-24T10:38:00.000Z',
  });

  assert.equal(deltas.length, 2);
  assert.equal(deltas[0].bucket_type, 'minute');
  assert.equal(deltas[0].sum_value, 64);
  assert.deepEqual(deltas[0].dimensions, { forecast_id: 'fc_123', status: 'critical' });
  assert.equal(deltas[1].bucket_start_at, '2026-05-24T10:00:00.000Z');
});
