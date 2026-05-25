import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMissingExpectedWatch } from '../../src/services/scheduled-watches/missing-expected.js';

function dbWithAggregateCount(countValue, batches = [], calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (sql.includes('SUM(count_value)')) return { count_value: countValue };
              if (sql.includes('watch_states')) return null;
              return null;
            },
            async all() {
              if (sql.includes('subscribers')) return { results: [] };
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
