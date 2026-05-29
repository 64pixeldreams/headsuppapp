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

test('builds unique alert ids for long Foretic watch ids across evaluations', () => {
  const longWatch = {
    ...watch,
    id: 'foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mlfl1bfqrxnbk1:pace:critical',
    watch_id: 'foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mlfl1bfqrxnbk1:pace:critical',
  };
  const first = buildAlert({
    watch: longWatch,
    evaluation,
    decision,
    input,
    now: '2026-05-28T05:39:35.457Z',
  });
  const second = buildAlert({
    watch: longWatch,
    evaluation,
    decision,
    input,
    now: '2026-05-28T05:39:40.792Z',
  });

  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^alert_2026_05_28/);
  assert.match(second.id, /^alert_2026_05_28/);
});

test('builds unique delivery ids for long subscriber ids on one alert', () => {
  const alert = buildAlert({ watch, evaluation, decision, input, now: '2026-05-24T10:05:00.000Z' });
  const deliveries = buildAlertDeliveries({
    alert,
    subscribers: [
      {
        subscriber_id: 'sub_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_board_example_com',
        destination_url: 'board@example.com',
      },
      {
        subscriber_id: 'sub_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_ops_example_com',
        destination_url: 'ops@example.com',
      },
    ],
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.equal(deliveries.length, 2);
  assert.notEqual(deliveries[0].id, deliveries[1].id);
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

test('persists deliveries only for subscribers whose dimension filter matches the alert forecast', async () => {
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            sql,
            params,
            async first() {
              if (/FROM signals/.test(sql)) return { signal_key: 'forecast.goal.risk' };
              if (/FROM watches/.test(sql)) return { watch_id: 'watch_goal_critical' };
              return null;
            },
            async all() {
              if (/FROM subscribers/.test(sql)) {
                return {
                  results: [
                    {
                      subscriber_id: 'sub_forecast_123',
                      destination_url: 'a@example.com',
                      config_json: JSON.stringify({ filters: { dimensions: { forecast_id: ['forecast_123'] } } }),
                    },
                    {
                      subscriber_id: 'sub_forecast_999',
                      destination_url: 'b@example.com',
                      config_json: JSON.stringify({ filters: { dimensions: { forecast_id: ['forecast_999'] } } }),
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
    watch: { ...watch, id: 'watch_goal_critical', watch_id: 'watch_goal_critical', signal_id: 'sig_goal' },
    evaluation: { ...evaluation, fields: { forecast_id: 'forecast_123' } },
    decision,
    input: { ...input, signalId: 'sig_goal' },
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.deepEqual(result.deliveries.map((delivery) => delivery.subscriber_id), ['sub_forecast_123']);
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

test('suppresses lower-severity duplicate attention deliveries for same subscriber and resource window', async () => {
  const alerts = [];
  const deliveries = [];
  const enqueued = [];
  const subscriber = { subscriber_id: 'sub_board', destination_url: 'board@example.com', config_json: '{}' };
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            sql,
            params,
            async run() {
              if (/UPDATE alert_deliveries/.test(sql)) {
                const delivery = deliveries.find((row) => row.id === params[3]);
                if (delivery && ['pending', 'retrying'].includes(delivery.status)) {
                  delivery.status = params[0];
                  delivery.response_body = params[1];
                  delivery.updated_at = params[2];
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              if (/FROM signals/.test(sql)) return { signal_key: 'forecast.revenue.pace' };
              if (/FROM watches/.test(sql)) return { watch_id: params[0] };
              return null;
            },
            async all() {
              if (/FROM subscribers/.test(sql)) return { results: [subscriber] };
              if (/FROM alert_deliveries/.test(sql)) {
                return {
                  results: deliveries
                    .filter((delivery) => delivery.subscriber_id === params[0] && ['pending', 'retrying', 'sent'].includes(delivery.status))
                    .map((delivery) => {
                      const alert = alerts.find((row) => row.id === delivery.alert_id);
                      return {
                        delivery_id: delivery.id,
                        delivery_status: delivery.status,
                        subscriber_id: delivery.subscriber_id,
                        alert_id: alert.id,
                        workspace_id: alert.workspace_id,
                        channel_id: alert.channel_id,
                        signal_id: alert.signal_id,
                        watch_id: alert.watch_id,
                        severity: alert.severity,
                        triggered_at: alert.triggered_at,
                        created_at: alert.created_at,
                        payload_json: alert.payload_json,
                      };
                    }),
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(items) {
      for (const item of items) {
        if (/INSERT INTO alerts/.test(item.sql)) {
          alerts.push({
            id: item.params[0],
            workspace_id: item.params[1],
            channel_id: item.params[2],
            signal_id: item.params[3],
            watch_id: item.params[4],
            severity: item.params[5],
            current_value: item.params[6],
            threshold_value: item.params[7],
            summary_text: item.params[8],
            payload_json: item.params[9],
            cta_label: item.params[10],
            cta_url: item.params[11],
            triggered_at: item.params[12],
            created_at: item.params[13],
          });
        }
        if (/INSERT INTO alert_deliveries/.test(item.sql)) {
          deliveries.push({
            id: item.params[0],
            alert_id: item.params[1],
            subscriber_id: item.params[2],
            destination_url: item.params[3],
            status: item.params[4],
            attempt_count: item.params[5],
            next_retry_at: item.params[7],
            response_body: item.params[9],
            created_at: item.params[10],
            updated_at: item.params[11],
          });
        }
      }
    },
  };
  const queue = {
    async sendBatch(messages) {
      enqueued.push(...messages);
    },
  };
  const commonInput = {
    ...input,
    signalId: 'sig_pace',
    bucketStartAt: '2026-05-24T10:00:00.000Z',
  };
  const commonFields = { forecast_id: 'forecast_123', attention_family: 'pace_health' };

  const warning = await persistAlertWithDeliveries({
    db,
    queue,
    watch: { ...watch, id: 'watch_pace_warning', watch_id: 'watch_pace_warning', signal_id: 'sig_pace', name: 'Pace warning' },
    evaluation: { threshold: 85, fields: commonFields },
    decision: { action: 'alert', severity: 'warning', current_value: 64 },
    input: commonInput,
    now: '2026-05-24T10:05:00.000Z',
  });
  const critical = await persistAlertWithDeliveries({
    db,
    queue,
    watch: { ...watch, id: 'watch_pace_critical', watch_id: 'watch_pace_critical', signal_id: 'sig_pace', name: 'Pace critical' },
    evaluation: { threshold: 70, fields: commonFields },
    decision: { action: 'alert', severity: 'critical', current_value: 64 },
    input: commonInput,
    now: '2026-05-24T10:05:01.000Z',
  });

  assert.equal(warning.deliveries.length, 1);
  assert.equal(critical.deliveries.length, 1);
  assert.equal(deliveries[0].status, 'suppressed_duplicate');
  assert.equal(deliveries[1].status, 'pending');
  assert.equal(enqueued.length, 2);
  assert.equal(enqueued[0].body.alertDeliveryId, deliveries[0].id);
  assert.equal(enqueued[1].body.alertDeliveryId, deliveries[1].id);
});

test('does not enqueue a lower-severity duplicate when a winner already exists', async () => {
  const alerts = [];
  const deliveries = [];
  const enqueued = [];
  const subscriber = { subscriber_id: 'sub_board', destination_url: 'board@example.com', config_json: '{}' };
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            sql,
            params,
            async run() {
              return { meta: { changes: 1 } };
            },
            async first() {
              if (/FROM signals/.test(sql)) return { signal_key: 'forecast.revenue.pace' };
              if (/FROM watches/.test(sql)) return { watch_id: params[0] };
              return null;
            },
            async all() {
              if (/FROM subscribers/.test(sql)) return { results: [subscriber] };
              if (/FROM alert_deliveries/.test(sql)) {
                return {
                  results: deliveries
                    .filter((delivery) => delivery.subscriber_id === params[0] && ['pending', 'retrying', 'sent'].includes(delivery.status))
                    .map((delivery) => {
                      const alert = alerts.find((row) => row.id === delivery.alert_id);
                      return {
                        delivery_id: delivery.id,
                        delivery_status: delivery.status,
                        subscriber_id: delivery.subscriber_id,
                        alert_id: alert.id,
                        workspace_id: alert.workspace_id,
                        channel_id: alert.channel_id,
                        signal_id: alert.signal_id,
                        watch_id: alert.watch_id,
                        severity: alert.severity,
                        triggered_at: alert.triggered_at,
                        created_at: alert.created_at,
                        payload_json: alert.payload_json,
                      };
                    }),
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(items) {
      for (const item of items) {
        if (/INSERT INTO alerts/.test(item.sql)) {
          alerts.push({
            id: item.params[0],
            workspace_id: item.params[1],
            channel_id: item.params[2],
            signal_id: item.params[3],
            watch_id: item.params[4],
            severity: item.params[5],
            current_value: item.params[6],
            threshold_value: item.params[7],
            summary_text: item.params[8],
            payload_json: item.params[9],
            triggered_at: item.params[12],
            created_at: item.params[13],
          });
        }
        if (/INSERT INTO alert_deliveries/.test(item.sql)) {
          deliveries.push({
            id: item.params[0],
            alert_id: item.params[1],
            subscriber_id: item.params[2],
            destination_url: item.params[3],
            status: item.params[4],
            response_body: item.params[9],
            created_at: item.params[10],
            updated_at: item.params[11],
          });
        }
      }
    },
  };
  const queue = { async sendBatch(messages) { enqueued.push(...messages); } };
  const common = {
    fields: { forecast_id: 'forecast_123', attention_family: 'pace_health' },
    input: { ...input, signalId: 'sig_pace', bucketStartAt: '2026-05-24T10:00:00.000Z' },
  };

  await persistAlertWithDeliveries({
    db,
    queue,
    watch: { ...watch, id: 'watch_pace_critical', watch_id: 'watch_pace_critical', signal_id: 'sig_pace' },
    evaluation: { threshold: 70, fields: common.fields },
    decision: { action: 'alert', severity: 'critical', current_value: 64 },
    input: common.input,
    now: '2026-05-24T10:05:00.000Z',
  });
  const warning = await persistAlertWithDeliveries({
    db,
    queue,
    watch: { ...watch, id: 'watch_pace_warning', watch_id: 'watch_pace_warning', signal_id: 'sig_pace' },
    evaluation: { threshold: 85, fields: common.fields },
    decision: { action: 'alert', severity: 'warning', current_value: 64 },
    input: common.input,
    now: '2026-05-24T10:05:01.000Z',
  });

  assert.equal(warning.deliveries[0].status, 'suppressed_duplicate');
  assert.equal(warning.suppressed_deliveries.length, 1);
  assert.equal(enqueued.length, 1);
});

test('allows recovery delivery when a critical alert already exists in the same bucket', async () => {
  const alerts = [];
  const deliveries = [];
  const enqueued = [];
  const subscriber = { subscriber_id: 'sub_board', destination_url: 'board@example.com', config_json: '{}' };
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            sql,
            params,
            async run() {
              if (/UPDATE alert_deliveries/.test(sql)) {
                const delivery = deliveries.find((row) => row.id === params[3]);
                if (delivery && ['pending', 'retrying'].includes(delivery.status)) {
                  delivery.status = params[0];
                  delivery.response_body = params[1];
                  delivery.updated_at = params[2];
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              if (/FROM signals/.test(sql)) return { signal_key: 'forecast.revenue.pace' };
              if (/FROM watches/.test(sql)) return { watch_id: params[0] };
              return null;
            },
            async all() {
              if (/FROM subscribers/.test(sql)) return { results: [subscriber] };
              if (/FROM alert_deliveries/.test(sql)) {
                return {
                  results: deliveries
                    .filter((delivery) => delivery.subscriber_id === params[0] && ['pending', 'retrying', 'sent'].includes(delivery.status))
                    .map((delivery) => {
                      const alert = alerts.find((row) => row.id === delivery.alert_id);
                      return {
                        delivery_id: delivery.id,
                        delivery_status: delivery.status,
                        subscriber_id: delivery.subscriber_id,
                        alert_id: alert.id,
                        workspace_id: alert.workspace_id,
                        channel_id: alert.channel_id,
                        signal_id: alert.signal_id,
                        watch_id: alert.watch_id,
                        severity: alert.severity,
                        triggered_at: alert.triggered_at,
                        created_at: alert.created_at,
                        payload_json: alert.payload_json,
                      };
                    }),
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(items) {
      for (const item of items) {
        if (/INSERT INTO alerts/.test(item.sql)) {
          alerts.push({
            id: item.params[0],
            workspace_id: item.params[1],
            channel_id: item.params[2],
            signal_id: item.params[3],
            watch_id: item.params[4],
            severity: item.params[5],
            current_value: item.params[6],
            threshold_value: item.params[7],
            summary_text: item.params[8],
            payload_json: item.params[9],
            triggered_at: item.params[12],
            created_at: item.params[13],
          });
        }
        if (/INSERT INTO alert_deliveries/.test(item.sql)) {
          deliveries.push({
            id: item.params[0],
            alert_id: item.params[1],
            subscriber_id: item.params[2],
            destination_url: item.params[3],
            status: item.params[4],
            response_body: item.params[9],
            created_at: item.params[10],
            updated_at: item.params[11],
          });
        }
      }
    },
  };
  const queue = { async sendBatch(messages) { enqueued.push(...messages); } };
  const common = {
    fields: { forecast_id: 'forecast_123', attention_family: 'pace_health' },
    input: { ...input, signalId: 'sig_pace', bucketStartAt: '2026-05-24T10:00:00.000Z' },
  };

  await persistAlertWithDeliveries({
    db,
    queue,
    watch: { ...watch, id: 'watch_pace_critical', watch_id: 'watch_pace_critical', signal_id: 'sig_pace' },
    evaluation: { threshold: 70, fields: common.fields },
    decision: { action: 'alert', severity: 'critical', current_value: 64 },
    input: common.input,
    now: '2026-05-24T10:05:00.000Z',
  });
  const recovery = await persistAlertWithDeliveries({
    db,
    queue,
    watch: { ...watch, id: 'watch_pace_critical', watch_id: 'watch_pace_critical', signal_id: 'sig_pace' },
    evaluation: { threshold: 70, fields: common.fields },
    decision: { action: 'recovery', severity: 'recovery', current_value: 95 },
    input: common.input,
    now: '2026-05-24T10:05:30.000Z',
  });

  assert.equal(recovery.deliveries[0].status, 'pending');
  assert.equal(recovery.suppressed_deliveries.length, 0);
  assert.equal(enqueued.length, 2);
});
