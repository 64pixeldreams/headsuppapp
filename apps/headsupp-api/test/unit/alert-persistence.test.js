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

test('persists deliveries only for matching subscriber alert filters', async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            sql,
            params,
            async first() {
              if (/FROM signals/.test(sql)) return { signal_key: 'forecast.goal.risk' };
              if (/FROM watches/.test(sql)) {
                return {
                  id: 'watch_goal_critical',
                  watch_id: 'watch_goal_critical',
                  watch_group_id: 'wg_goal',
                  band_key: 'critical',
                };
              }
              if (/FROM watch_groups/.test(sql)) {
                return {
                  id: 'wg_goal',
                  watch_group_id: 'wg_goal',
                  group_key: 'forecast_goal_health',
                };
              }
              return null;
            },
            async all() {
              if (/FROM subscribers/.test(sql)) {
                return {
                  results: [
                    {
                      subscriber_id: 'sub_goal',
                      destination_url: 'goal@example.com',
                      config_json: JSON.stringify({ filters: { signal_keys: ['forecast.goal.risk'] } }),
                    },
                    {
                      subscriber_id: 'sub_pace',
                      destination_url: 'pace@example.com',
                      config_json: JSON.stringify({ filters: { signal_keys: ['forecast.revenue.pace'] } }),
                    },
                    {
                      subscriber_id: 'sub_all',
                      destination_url: 'all@example.com',
                      config_json: '{}',
                    },
                  ],
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(items) {
      statements.push(...items);
    },
  };

  const result = await persistAlertWithDeliveries({
    db,
    watch: {
      ...watch,
      id: 'watch_goal_critical',
      watch_id: 'watch_goal_critical',
      signal_id: 'sig_goal',
      watch_group_id: 'wg_goal',
      band_key: 'critical',
      name: 'Goal risk critical',
    },
    evaluation,
    decision,
    input: { ...input, signalId: 'sig_goal', watchGroupId: 'wg_goal' },
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.equal(result.deliveries.length, 2);
  assert.deepEqual(result.deliveries.map((delivery) => delivery.subscriber_id).sort(), ['sub_all', 'sub_goal']);
  assert.equal(statements.filter((statement) => /INSERT INTO alert_deliveries/.test(statement.sql)).length, 2);
});

test('persists deliveries for matching watch group and band filters', async () => {
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            sql,
            params,
            async first() {
              if (/FROM signals/.test(sql)) return { signal_key: 'forecast.revenue.pace' };
              if (/FROM watches/.test(sql)) return { watch_id: 'watch_pace_critical', watch_group_id: 'wg_pace', band_key: 'critical' };
              if (/FROM watch_groups/.test(sql)) return { watch_group_id: 'wg_pace', group_key: 'forecast_pace_health' };
              return null;
            },
            async all() {
              if (/FROM subscribers/.test(sql)) {
                return {
                  results: [
                    {
                      subscriber_id: 'sub_group',
                      destination_url: 'group@example.com',
                      config_json: JSON.stringify({ filters: { watch_group_keys: ['forecast_pace_health'] } }),
                    },
                    {
                      subscriber_id: 'sub_band',
                      destination_url: 'band@example.com',
                      config_json: JSON.stringify({ filters: { band_keys: ['critical'] } }),
                    },
                    {
                      subscriber_id: 'sub_warning',
                      destination_url: 'warning@example.com',
                      config_json: JSON.stringify({ filters: { band_keys: ['warning'] } }),
                    },
                  ],
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
    async batch() {},
  };

  const result = await persistAlertWithDeliveries({
    db,
    watch: {
      ...watch,
      id: 'watch_pace_critical',
      watch_id: 'watch_pace_critical',
      watch_group_id: 'wg_pace',
      band_key: 'critical',
    },
    evaluation,
    decision: { ...decision, severity: 'critical' },
    input: { ...input, watchGroupId: 'wg_pace' },
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.deepEqual(result.deliveries.map((delivery) => delivery.subscriber_id).sort(), ['sub_band', 'sub_group']);
});
