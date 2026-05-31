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

function createOccurrenceEvaluatorDb({ existingOccurrence = null, batchItems = [] } = {}) {
  const occurrenceRows = new Map();
  if (existingOccurrence) occurrenceRows.set(existingOccurrence.occurrence_key, existingOccurrence);
  const updates = [];
  return {
    updates,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM watches')) {
                return {
                  id: 'watch_goal_reached',
                  watch_id: 'watch_goal_reached',
                  workspace_id: 'ws_123',
                  channel_id: 'ch_123',
                  signal_id: 'sig_goal',
                  name: 'Goal reached',
                  watch_type: 'EVENT_OCCURRENCE',
                  config_json: JSON.stringify({
                    event_type: 'goal_reached',
                    dedupe_key_path: 'fields.goal_id',
                    severity: 'success',
                    template_id: 'forecast_win_v1',
                  }),
                  cooldown_seconds: 86400,
                  enabled: 1,
                };
              }
              if (sql.includes('FROM watch_occurrences') && sql.includes('workspace_id')) {
                return occurrenceRows.get(params[3]) || null;
              }
              if (sql.includes('FROM watch_occurrences') && sql.includes('WHERE id')) {
                return Array.from(occurrenceRows.values()).find((row) => row.id === params[0]) || null;
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
              if (sql.includes('INSERT OR IGNORE INTO watch_occurrences')) {
                const row = {
                  id: params[0],
                  workspace_id: params[1],
                  channel_id: params[2],
                  watch_id: params[3],
                  occurrence_key: params[4],
                  alert_id: params[5],
                };
                if (occurrenceRows.has(row.occurrence_key)) return { meta: { changes: 0 } };
                occurrenceRows.set(row.occurrence_key, row);
                return { meta: { changes: 1 } };
              }
              if (sql.includes('UPDATE watch_occurrences')) {
                updates.push({ sql, params });
                const row = Array.from(occurrenceRows.values()).find((item) => item.id === params[3]);
                if (row) row.alert_id = params[0];
              }
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

test('event occurrence watch alerts once per occurrence key and links occurrence to alert', async () => {
  const batchItems = [];
  const queueBatches = [];
  const db = createOccurrenceEvaluatorDb({ batchItems });
  const input = {
    watchId: 'watch_goal_reached',
    reason: 'aggregate_updated',
    signalId: 'sig_goal',
    bucketType: 'minute',
    bucketStartAt: '2026-05-24T10:00:00.000Z',
    eventContext: {
      idempotency_key: 'foretic:forecast_123:goal_reached:goal_456',
      value: { num: 1 },
      fields: {
        event_type: 'goal_reached',
        goal_id: 'goal_456',
        tone: 'success',
        notification: { summary: 'Goal reached.' },
      },
      cta: { label: 'View forecast', url: 'https://example.com/forecast', variant: 'success' },
    },
    now: '2026-05-24T10:05:00.000Z',
  };

  const first = await evaluateWatchRequest({
    db,
    env: {
      ALERT_DELIVERY_QUEUE: {
        async sendBatch(batch) {
          queueBatches.push(batch);
        },
      },
    },
    input,
  });
  const duplicate = await evaluateWatchRequest({ db, input: { ...input, now: '2026-05-24T10:06:00.000Z' } });
  const second = await evaluateWatchRequest({
    db,
    input: {
      ...input,
      eventContext: {
        ...input.eventContext,
        idempotency_key: 'foretic:forecast_123:goal_reached:goal_789',
        fields: {
          ...input.eventContext.fields,
          goal_id: 'goal_789',
        },
      },
      now: '2026-05-24T10:07:00.000Z',
    },
  });

  assert.equal(first.action, 'alert');
  assert.equal(first.occurrence_key, 'goal_456');
  assert.equal(first.deliveries, 1);
  assert.equal(queueBatches[0][0].body.alertDeliveryId.startsWith('delivery_'), true);
  assert.equal(duplicate.action, 'none');
  assert.equal(duplicate.reason, 'OCCURRENCE_ALREADY_PROCESSED');
  assert.equal(second.action, 'alert');
  assert.equal(second.occurrence_key, 'goal_789');
  assert.equal(batchItems.length, 6);
  assert.equal(db.updates.length, 2);
  const watchStateStatements = batchItems.filter((item) => /INSERT INTO watch_states/.test(item.sql));
  assert.equal(watchStateStatements.every((item) => item.params[6] === null), true);
});

test('test event occurrence does not suppress production occurrence for same goal id', async () => {
  const batchItems = [];
  const db = createOccurrenceEvaluatorDb({ batchItems });
  const baseInput = {
    watchId: 'watch_goal_reached',
    reason: 'aggregate_updated',
    signalId: 'sig_goal',
    bucketType: 'minute',
    bucketStartAt: '2026-05-24T10:00:00.000Z',
    eventContext: {
      idempotency_key: 'foretic:forecast_123:goal_reached:goal_456:test',
      value: { num: 1 },
      fields: {
        event_type: 'goal_reached',
        goal_id: 'goal_456',
        test: true,
        notification: { summary: '[TEST] Goal reached.' },
      },
    },
    now: '2026-05-24T10:05:00.000Z',
  };

  const testEvent = await evaluateWatchRequest({ db, input: baseInput });
  const duplicateTestEvent = await evaluateWatchRequest({
    db,
    input: { ...baseInput, now: '2026-05-24T10:06:00.000Z' },
  });
  const productionEvent = await evaluateWatchRequest({
    db,
    input: {
      ...baseInput,
      eventContext: {
        ...baseInput.eventContext,
        idempotency_key: 'foretic:forecast_123:goal_reached:goal_456',
        fields: {
          event_type: 'goal_reached',
          goal_id: 'goal_456',
          notification: { summary: 'Goal reached.' },
        },
      },
      now: '2026-05-24T10:07:00.000Z',
    },
  });

  assert.equal(testEvent.action, 'alert');
  assert.equal(duplicateTestEvent.action, 'none');
  assert.equal(duplicateTestEvent.reason, 'OCCURRENCE_ALREADY_PROCESSED');
  assert.equal(productionEvent.action, 'alert');
  assert.equal(productionEvent.occurrence_key, 'goal_456');
});
