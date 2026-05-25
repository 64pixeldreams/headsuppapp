import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateAggregateForwardWatch } from '../../src/services/aggregate-forward/evaluator.js';
import { processRetryableDeliveries } from '../../src/services/scheduler/scheduled-tasks.js';

function createDb(calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async all() {
              if (sql.includes('FROM aggregates')) {
                return {
                  results: [
                    {
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
                    },
                  ],
                };
              }
              if (sql.includes('alert_deliveries') || sql.includes('aggregate_deliveries') || sql.includes('quiet_summary_deliveries')) {
                return { results: [] };
              }
              return { results: [] };
            },
            async first() {
              if (sql.includes('FROM subscribers')) return { subscriber_id: 'sub_123' };
              if (sql.includes('FROM signals')) return { id: 'sig_123', signal_key: 'oxygen.percent' };
              if (sql.includes('FROM channels')) return { channel_id: 'ch_123' };
              return null;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
        async all() {
          return { results: [] };
        },
      };
    },
  };
}

test('evaluates aggregate-forward watch for closed buckets', async () => {
  const batches = [];
  const result = await evaluateAggregateForwardWatch({
    db: createDb(),
    queue: { async sendBatch(batch) { batches.push(batch); } },
    watch: {
      signal_id: 'sig_123',
      channel_id: 'ch_123',
      config_json: JSON.stringify({ bucket_type: 'hour', subscriber_id: 'sub_123' }),
    },
    now: '2026-05-24T11:02:00.000Z',
  });

  assert.equal(result.created, 1);
  assert.equal(result.enqueued, 1);
  assert.equal(batches[0][0].body.aggregateDeliveryId.startsWith('aggdel_'), true);
});

test('processRetryableDeliveries returns retry counts', async () => {
  const result = await processRetryableDeliveries({ DB: createDb() });

  assert.equal(result.alert_retries, 0);
  assert.equal(result.aggregate_retries, 0);
  assert.equal(result.quiet_summary_retries, 0);
});
