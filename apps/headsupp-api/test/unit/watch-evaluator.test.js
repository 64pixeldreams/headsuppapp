import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateWatchRequest } from '../../src/services/watches/watch-evaluator.js';

function createEvaluatorDb(batchItems = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM watches')) {
                return {
                  id: 'watch_123',
                  workspace_id: 'ws_123',
                  channel_id: 'ch_123',
                  signal_id: 'sig_123',
                  name: 'Forecast pace warning',
                  watch_type: 'LAST_VALUE_LT',
                  threshold: 85,
                  severity: 'warning',
                  cooldown_seconds: 3600,
                  enabled: 1,
                };
              }
              if (sql.includes('FROM watch_states')) return null;
              if (sql.includes('FROM aggregates')) {
                return {
                  signal_id: 'sig_123',
                  bucket_type: 'minute',
                  bucket_start_at: '2026-05-24T10:00:00.000Z',
                  last_value: 84,
                };
              }
              return null;
            },
            async all() {
              if (sql.includes('FROM watch_action_controls')) return { results: [] };
              if (sql.includes('FROM subscribers')) {
                return {
                  results: [{ subscriber_id: 'sub_123', destination_url: 'https://example.com/webhook' }],
                };
              }
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
      batchItems.push(...items);
    },
  };
}

test('evaluates watch request and enqueues alert deliveries', async () => {
  const batchItems = [];
  const queueBatches = [];
  const result = await evaluateWatchRequest({
    db: createEvaluatorDb(batchItems),
    env: {
      ALERT_DELIVERY_QUEUE: {
        async sendBatch(batch) {
          queueBatches.push(batch);
        },
      },
    },
    input: {
      watchId: 'watch_123',
      reason: 'aggregate_updated',
      signalId: 'sig_123',
      bucketType: 'minute',
      bucketStartAt: '2026-05-24T10:00:00.000Z',
      now: '2026-05-24T10:05:00.000Z',
    },
  });

  assert.equal(result.evaluated, true);
  assert.equal(result.action, 'alert');
  assert.equal(result.deliveries, 1);
  assert.equal(result.enqueued_deliveries, 1);
  assert.equal(batchItems.length, 3);
  assert.equal(queueBatches[0][0].body.alertDeliveryId.startsWith('delivery_'), true);
});

test('evaluates watch request without alert when active action control gates it', async () => {
  const db = createEvaluatorDb([]);
  const originalPrepare = db.prepare;
  db.prepare = (sql) => {
    const prepared = originalPrepare(sql);
    return {
      bind(...params) {
        const bound = prepared.bind(...params);
        return {
          ...bound,
          async all() {
            if (sql.includes('FROM watch_action_controls')) {
              return {
                results: [
                  {
                    id: 'act_mute',
                    action_type: 'mute',
                    status: 'active',
                    expires_at: null,
                  },
                ],
              };
            }
            return bound.all();
          },
        };
      },
    };
  };

  const result = await evaluateWatchRequest({
    db,
    input: {
      watchId: 'watch_123',
      signalId: 'sig_123',
      bucketType: 'minute',
      bucketStartAt: '2026-05-24T10:00:00.000Z',
      now: '2026-05-24T10:05:00.000Z',
    },
  });

  assert.equal(result.evaluated, true);
  assert.equal(result.action, 'none');
  assert.equal(result.reason, 'WATCH_MUTED');
});
