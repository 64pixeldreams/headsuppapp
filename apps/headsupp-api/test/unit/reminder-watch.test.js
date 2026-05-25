import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateReminderWatch } from '../../src/services/scheduled-watches/reminder.js';

function reminderDb(batches = [], runs = [], subscribers = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('watch_states')) return null;
              return null;
            },
            async all() {
              if (sql.includes('subscribers')) return { results: subscribers };
              if (sql.includes('watch_action_controls')) return { results: [] };
              return { results: [] };
            },
            async run() {
              runs.push({ sql, params });
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
  id: 'watch_renewal',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_renewal',
  name: 'OpenAI renewal',
  watch_type: 'REMINDER_DUE',
  cooldown_seconds: 3600,
  config_json: JSON.stringify({
    due_at: '2026-06-01T00:00:00.000Z',
    lead: { unit: 'day', count: 7 },
    severity: 'warning',
    label: 'OpenAI renewal',
  }),
};

test('reminder watch stays quiet before lead window', async () => {
  const runs = [];
  const result = await evaluateReminderWatch({
    db: reminderDb([], runs),
    watch,
    now: '2026-05-20T00:00:00.000Z',
  });

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'REMINDER_NOT_DUE');
  assert.ok(runs.some((run) => run.sql.includes('watch_states')));
});

test('reminder watch creates alert inside lead window', async () => {
  const batches = [];
  const result = await evaluateReminderWatch({
    db: reminderDb(batches),
    watch,
    now: '2026-05-26T00:00:00.000Z',
  });

  assert.equal(result.triggered, true);
  assert.equal(result.alert.severity, 'warning');
  assert.equal(result.alert.current_value, 518400);
  assert.equal(batches.length, 2);
});

test('reminder watch enqueues created alert deliveries when queue exists', async () => {
  const batches = [];
  const queueBatches = [];
  const result = await evaluateReminderWatch({
    db: reminderDb(batches, [], [{ subscriber_id: 'sub_123', destination_url: 'https://example.com/webhook' }]),
    queue: {
      async sendBatch(batch) {
        queueBatches.push(batch);
      },
    },
    watch,
    now: '2026-05-26T00:00:00.000Z',
  });

  assert.equal(result.triggered, true);
  assert.equal(result.deliveries.length, 1);
  assert.equal(result.enqueued_deliveries, 1);
  assert.equal(queueBatches[0][0].body.alertDeliveryId.startsWith('delivery_'), true);
});

test('reminder watch expires when configured', async () => {
  const result = await evaluateReminderWatch({
    db: reminderDb(),
    watch: {
      ...watch,
      config_json: JSON.stringify({
        due_at: '2026-06-01T00:00:00.000Z',
        lead: { unit: 'day', count: 7 },
        expires_after_seconds: 3600,
      }),
    },
    now: '2026-06-01T02:00:00.000Z',
  });

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'REMINDER_EXPIRED');
});
