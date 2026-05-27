import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAlert,
  buildAlertDeliveries,
  loadAlertSubscribers,
  persistAlertWithDeliveries,
} from '../../src/services/alerts/persistence.js';

const watch = {
  id: 'watch_123',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_123',
  name: 'Forecast pace warning',
  cooldown_seconds: 3600,
};

const evaluation = {
  threshold: 85,
};

const decision = {
  action: 'alert',
  severity: 'warning',
  current_value: 84,
};

const input = {
  signalId: 'sig_123',
  bucketType: 'minute',
  bucketStartAt: '2026-05-24T10:00:00.000Z',
};

test('builds alert record preserving watch and aggregate context', () => {
  const alert = buildAlert({
    watch,
    evaluation,
    decision,
    input,
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.equal(alert.workspace_id, 'ws_123');
  assert.equal(alert.channel_id, 'ch_123');
  assert.equal(alert.watch_id, 'watch_123');
  assert.equal(alert.severity, 'warning');
  assert.match(alert.summary_text, /Forecast pace warning/);
  assert.equal(JSON.parse(alert.payload_json).bucket_type, 'minute');
});

test('builds pending alert delivery rows for subscribers', () => {
  const alert = buildAlert({ watch, evaluation, decision, input, now: '2026-05-24T10:05:00.000Z' });
  const deliveries = buildAlertDeliveries({
    alert,
    subscribers: [{ subscriber_id: 'sub_123', destination_url: 'https://example.com/webhook' }],
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].status, 'pending');
  assert.equal(deliveries[0].attempt_count, 0);
  assert.equal(deliveries[0].next_retry_at, '2026-05-24T10:05:00.000Z');
});

test('persists alert, watch state, and deliveries in D1 batch', async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return { sql, params };
        },
      };
    },
    async batch(items) {
      statements.push(...items);
    },
  };
  db.prepare = (sql) => ({
    bind(...params) {
      return {
        sql,
        params,
        async all() {
          return {
            results: [{ subscriber_id: 'sub_123', destination_url: 'https://example.com/webhook' }],
          };
        },
      };
    },
  });

  const result = await persistAlertWithDeliveries({
    db,
    watch,
    evaluation,
    decision,
    input,
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.equal(result.deliveries.length, 1);
  assert.equal(statements.length, 3);
  assert.match(statements[0].sql, /INSERT INTO alerts/);
  assert.match(statements[1].sql, /INSERT INTO watch_states/);
  assert.match(statements[1].sql, /last_alert_at/);
  assert.doesNotMatch(statements[1].sql, /last_triggered_at/);
  assert.match(statements[2].sql, /INSERT INTO alert_deliveries/);
});

test('loads channel and workspace-scoped alert subscribers', async () => {
  const binds = [];
  const db = {
    prepare(sql) {
      assert.match(sql, /COALESCE\(subscriber_scope, 'channel'\)/);
      assert.match(sql, /subscriber_scope = 'workspace'/);
      return {
        bind(...params) {
          binds.push(params);
          return {
            async all() {
              return {
                results: [
                  {
                    subscriber_id: 'sub_channel',
                    subscriber_scope: 'channel',
                    channel_id: 'ch_123',
                    workspace_id: 'ws_123',
                    destination_url: 'https://example.com/channel',
                  },
                  {
                    subscriber_id: 'sub_workspace',
                    subscriber_scope: 'workspace',
                    channel_id: '__workspace__:ws_123',
                    workspace_id: 'ws_123',
                    destination_url: 'https://example.com/workspace',
                  },
                ],
              };
            },
          };
        },
      };
    },
  };

  const subscribers = await loadAlertSubscribers(db, { workspaceId: 'ws_123', channelId: 'ch_123' });

  assert.deepEqual(binds[0], ['ch_123', 'ws_123']);
  assert.equal(subscribers.length, 2);
  assert.equal(subscribers[0].subscriber_id, 'sub_channel');
  assert.equal(subscribers[1].subscriber_id, 'sub_workspace');
});
