import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMissingExpectedWatch } from '../../src/services/scheduled-watches/missing-expected.js';

function dbWithAggregateCount(countValue, batches = [], calls = [], subscribers = []) {
  const aggregateRow =
    typeof countValue === 'object'
      ? countValue
      : {
          count_value: countValue,
          sum_value: countValue,
          avg_value: countValue,
          min_value: countValue,
          max_value: countValue,
        };
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (sql.includes('SUM(count_value)')) return aggregateRow;
              if (sql.includes('watch_states')) return null;
              return null;
            },
            async all() {
              if (sql.includes('subscribers')) return { results: subscribers };
              if (sql.includes('watch_action_controls')) return { results: [] };
              return { results: [] };
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(items) {
      batches.push(...items);
    },
  };
}

const watch = {
  id: 'watch_missing',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_123',
  name: 'Missing forecast update',
  watch_type: 'MISSING_EXPECTED',
  cooldown_seconds: 3600,
  config_json: JSON.stringify({
    expected_every: { unit: 'hour', count: 3 },
    grace_seconds: 3600,
    minimum_count: 1,
    severity: 'warning',
  }),
};

test('missing expected watch triggers when aggregate count is below minimum', async () => {
  const batches = [];
  const result = await evaluateMissingExpectedWatch({
    db: dbWithAggregateCount(0, batches),
    watch,
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.triggered, true);
  assert.equal(result.alert.severity, 'warning');
  assert.equal(batches.length, 2);
});

test('missing expected watch uses explicit due window when configured', async () => {
  const calls = [];
  const result = await evaluateMissingExpectedWatch({
    db: dbWithAggregateCount(1, [], calls),
    watch: {
      ...watch,
      config_json: JSON.stringify({
        due_window: {
          start_at: '2026-05-24T00:00:00.000Z',
          end_at: '2026-05-24T23:59:59.000Z',
        },
        bucket_type: 'day',
      }),
    },
    now: '2026-05-25T01:00:00.000Z',
  });

  const aggregateCall = calls.find((call) => call.sql.includes('SUM(count_value)'));
  assert.equal(result.triggered, false);
  assert.equal(aggregateCall.params[2], '2026-05-24T00:00:00.000Z');
  assert.equal(aggregateCall.params[3], '2026-05-24T23:59:59.000Z');
});

test('missing expected watch triggers when value range is not met', async () => {
  const batches = [];
  const result = await evaluateMissingExpectedWatch({
    db: dbWithAggregateCount({ count_value: 1, sum_value: 75, avg_value: 75, min_value: 75, max_value: 75 }, batches),
    watch: {
      ...watch,
      config_json: JSON.stringify({
        expected_every: { unit: 'day', count: 1 },
        minimum_count: 1,
        value_range: { field: 'sum', min: 100, max: 200 },
      }),
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.triggered, true);
  assert.equal(result.alert.current_value, 75);
  assert.equal(batches.length, 2);
});

test('missing expected watch enqueues created alert deliveries when queue exists', async () => {
  const batches = [];
  const queueBatches = [];
  const result = await evaluateMissingExpectedWatch({
    db: dbWithAggregateCount(0, batches, [], [{ subscriber_id: 'sub_123', destination_url: 'https://example.com/webhook' }]),
    queue: {
      async sendBatch(batch) {
        queueBatches.push(batch);
      },
    },
    watch,
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.triggered, true);
  assert.equal(result.deliveries.length, 1);
  assert.equal(result.enqueued_deliveries, 1);
  assert.equal(queueBatches[0][0].body.alertDeliveryId.startsWith('delivery_'), true);
});

test('missing expected watch stays silent when aggregate count exists', async () => {
  const result = await evaluateMissingExpectedWatch({
    db: dbWithAggregateCount(1),
    watch,
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'WATCH_NOT_TRIGGERED');
});

test('missing expected watch filters by bucket type and dimensions when configured', async () => {
  const calls = [];
  const result = await evaluateMissingExpectedWatch({
    db: dbWithAggregateCount(1, [], calls),
    watch: {
      ...watch,
      config_json: JSON.stringify({
        expected_every: { unit: 'hour', count: 3 },
        bucket_type: 'hour',
        dimensions: { forecast_id: 'fc_123', status: 'warning' },
      }),
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  const aggregateCall = calls.find((call) => call.sql.includes('SUM(count_value)'));
  assert.equal(result.triggered, false);
  assert.equal(aggregateCall.params[1], 'hour');
  assert.equal(typeof aggregateCall.params[4], 'string');
  assert.notEqual(aggregateCall.params[4], null);
});
