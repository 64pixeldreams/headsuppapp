import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChannelRow,
  buildChannelContractRow,
  buildConnectorRow,
  buildSubscriberRow,
  buildWatchRow,
  createAdminChannel,
  createAdminChannelContract,
  createAdminConnector,
  deleteAdminSubscriber,
  disableAdminSubscriber,
  createAdminSignal,
  createAdminSubscriber,
  createAdminWatch,
  createAdminWorkspace,
  getAdminChannel,
  getAdminChannelContract,
  getAdminSubscriber,
  ignoreAdminAlert,
  listAdminSubscribers,
  muteAdminWatch,
  resumeAdminWatch,
  snoozeAdminWatch,
  updateAdminChannel,
  updateAdminChannelContract,
  updateAdminWatch,
} from '../../src/services/admin/control-plane.js';
import { provisionAdminChannel } from '../../src/services/admin/provision-channel.js';
import { stableId } from '../../src/services/ids/stable-id.js';
import { foreticForecastWatchDefinitions } from '../../src/services/foretic/forecast-watch-defaults.js';

function dbRecorder(calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

function scopedDb(rows = {}, calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
            async first() {
              if (/FROM workspaces/.test(sql)) return rows.workspace || null;
              if (/FROM channels/.test(sql)) return rows.channel || null;
              if (/FROM connectors/.test(sql)) return rows.connector || null;
              if (/FROM subscribers/.test(sql)) return rows.subscriber || null;
              if (/FROM signals/.test(sql)) return rows.signal || null;
              if (/FROM watches/.test(sql)) return rows.watch || null;
              if (/FROM alerts/.test(sql)) return rows.alert || null;
              if (/FROM channel_contracts/.test(sql)) return rows.channelContract || null;
              return null;
            },
            async all() {
              if (/FROM subscribers/.test(sql)) return { results: rows.subscribers || [] };
              if (/FROM watches/.test(sql)) return { results: rows.watches || [] };
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function provisionDb(calls = []) {
  const tables = {
    workspaces: [],
    channels: [],
    connectors: [],
    signals: [],
    watches: [],
    watch_groups: [],
    subscribers: [],
    signal_contracts: [],
    channel_contracts: [],
  };
  const firstFrom = (sql, params) => {
    if (/FROM workspaces/.test(sql)) {
      return tables.workspaces.find((row) => [row.id, row.workspace_id, row.workspace_key].includes(params[0])) || null;
    }
    if (/FROM channels/.test(sql)) {
      return tables.channels.find((row) => [row.id, row.channel_id, row.channel_key].includes(params[0])) || null;
    }
    if (/FROM connectors/.test(sql)) {
      return tables.connectors.find((row) => row.connector_key === params[0] || row.id === params[0] || row.connector_id === params[0]) || null;
    }
    if (/FROM signals/.test(sql)) {
      if (/channel_id = \? AND signal_key = \?/.test(sql)) {
        return tables.signals.find((row) => row.channel_id === params[0] && row.signal_key === params[1]) || null;
      }
      return tables.signals.find((row) => row.id === params[0] || row.signal_id === params[0]) || null;
    }
    if (/FROM watches/.test(sql)) {
      return tables.watches.find((row) => row.id === params[0] || row.watch_id === params[0]) || null;
    }
    if (/FROM watch_groups/.test(sql)) {
      if (/channel_id = \? AND group_key = \?/.test(sql)) {
        return tables.watch_groups.find((row) => row.channel_id === params[0] && row.group_key === params[1]) || null;
      }
      return tables.watch_groups.find((row) => row.id === params[0] || row.watch_group_id === params[0]) || null;
    }
    if (/FROM subscribers/.test(sql)) {
      return tables.subscribers.find((row) => row.id === params[0] || row.subscriber_id === params[0]) || null;
    }
    if (/FROM channel_contracts/.test(sql)) {
      return tables.channel_contracts.find((row) => row.channel_id === params[0] && row.status === params[1]) || null;
    }
    return null;
  };
  return {
    tables,
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async run() {
              const match = sql.match(/INSERT OR IGNORE INTO (\w+) \(([^)]+)\)/);
              if (match) {
                const [, table, columnsCsv] = match;
                const columns = columnsCsv.split(',').map((column) => column.trim());
                const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
                const id = row.id || row[`${table.slice(0, -1)}_id`];
                const existing = tables[table]?.find((item) => item.id === id || item[`${table.slice(0, -1)}_id`] === id);
                if (!existing) tables[table].push(row);
              }
              if (/UPDATE channel_contracts SET status/.test(sql)) {
                for (const row of tables.channel_contracts) {
                  if (row.channel_id === params[2] && row.status === params[3]) row.status = params[0];
                }
              }
              if (/UPDATE subscribers/.test(sql)) {
                const subscriber = tables.subscribers.find((row) => row.id === params[11] || row.subscriber_id === params[12]);
                if (subscriber) {
                  Object.assign(subscriber, {
                    name: params[0],
                    destination_url: params[1],
                    normalized_destination: params[2],
                    destination_url_redacted: params[3],
                    config_json: params[4],
                    enabled: params[5],
                    source_app: params[6],
                    external_tenant_id: params[7],
                    external_user_id: params[8],
                    external_resource_id: params[9],
                    updated_at: params[10],
                  });
                }
              }
              if (/UPDATE watches\s+SET enabled = 0/.test(sql)) {
                let changes = 0;
                for (const row of tables.watches) {
                  if (params.length === 3 && (row.id === params[1] || row.watch_id === params[2])) {
                    row.enabled = 0;
                    row.updated_at = params[0];
                    changes += 1;
                    continue;
                  }
                  const scoped = row.workspace_id === params[1] && row.channel_id === params[2] && row.signal_id === params[3];
                  const activeUngrouped = Number(row.enabled) === 1 && !row.watch_group_id;
                  const exactMatch = params.length === 6 && (row.id === params[4] || row.watch_id === params[5]);
                  const likePattern = params.length === 5 && String(row.watch_id || '').includes(String(params[4]).replaceAll('%', ''));
                  if (scoped && activeUngrouped && (exactMatch || likePattern)) {
                    row.enabled = 0;
                    row.updated_at = params[0];
                    changes += 1;
                  }
                }
                return { meta: { changes } };
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              return firstFrom(sql, params);
            },
            async all() {
              if (/FROM subscribers/.test(sql)) return { results: tables.subscribers };
              if (/FROM watches/.test(sql)) return { results: tables.watches };
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

const auth = {
  user_id: 'user_admin',
  permissions: ['workspace:create', 'signal:create'],
};

test('admin workspace creation requires permission and inserts D1 row', async () => {
  const calls = [];
  const result = await createAdminWorkspace({
    auth,
    db: dbRecorder(calls),
    input: { name: 'Foretic Demo', source_app: 'foretic', external_tenant_id: 'user:123', external_user_id: 'user:123' },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.workspace.source_app, 'foretic');
  assert.match(calls.find((call) => /INSERT OR IGNORE INTO workspaces/.test(call.sql)).sql, /INSERT OR IGNORE INTO workspaces/);
});

test('admin workspace creation rejects missing permission', async () => {
  const result = await createAdminWorkspace({
    auth: { user_id: 'user_admin', permissions: [] },
    db: dbRecorder(),
    input: { name: 'Denied' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERMISSION_DENIED');
});

test('admin workspace creation validates required fields before D1 writes', async () => {
  const calls = [];
  const result = await createAdminWorkspace({
    auth,
    db: dbRecorder(calls),
    input: {
      workspace_key: 'foretic:user:123',
      display_name: 'Foretic',
      source_app: 'foretic',
      external_tenant_id: 'user:123',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.equal(result.details.field, 'external_user_id');
  assert.equal(calls.length, 0);
});

test('admin workspace creation rejects API-key tenant scope mismatch before insert', async () => {
  const calls = [];
  const result = await createAdminWorkspace({
    auth: {
      user_id: 'service:foretic-temp',
      permissions: ['workspace:create'],
      source_app: 'foretic',
      external_tenant_id: 'internal-temp',
    },
    db: dbRecorder(calls),
    input: {
      name: 'Foretic user',
      source_app: 'foretic',
      external_tenant_id: 'user:123',
      external_user_id: 'user:123',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TENANT_SCOPE_MISMATCH');
  assert.equal(result.details.expected, 'internal-temp');
  assert.equal(result.details.received, 'user:123');
  assert.equal(calls.length, 0);
});

test('channel row serializes metadata JSON', () => {
  const row = buildChannelRow({
    workspace_id: 'ws_123',
    name: 'Demo Channel',
    metadata: { forecast_id: 'fc_123', user_id: 'user_123' },
  });

  assert.deepEqual(JSON.parse(row.metadata_json), { forecast_id: 'fc_123', user_id: 'user_123' });
});

test('admin channel create stores metadata object', async () => {
  const calls = [];
  const result = await createAdminChannel({
    auth: { user_id: 'user_admin', permissions: ['channel:create'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_1' },
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_123',
      name: 'Demo Channel',
      metadata: { forecast_id: 'fc_123' },
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.channel.metadata, { forecast_id: 'fc_123' });
  const insert = calls.find((call) => /INSERT OR IGNORE INTO channels/.test(call.sql));
  assert.equal(typeof insert.params.find((value) => typeof value === 'string' && value.includes('forecast_id')), 'string');
});

test('admin subscriber create supports workspace-scoped webhook alert callbacks', async () => {
  const calls = [];
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_1' },
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_123',
      subscriber_scope: 'workspace',
      subscriber_type: 'webhook',
      destination_url: 'https://example.com/heads-up',
      mode: 'alert',
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.subscriber.subscriber_scope, 'workspace');
  assert.equal(result.subscriber.channel_id, null);
  const insert = calls.find((call) => /INSERT OR IGNORE INTO subscribers/.test(call.sql));
  assert.ok(insert.params.includes('workspace'));
  assert.ok(insert.params.includes('__workspace__:ws_123'));
});

test('admin subscriber create rejects unsupported workspace subscriber types', async () => {
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_1' },
    }),
    input: {
      workspace_id: 'ws_123',
      scope: 'workspace',
      subscriber_type: 'email',
      destination_url: 'martin@example.com',
      mode: 'alert',
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_SUBSCRIBER_SCOPE');
});

test('admin provisionChannel creates a complete idempotent channel setup', async () => {
  const calls = [];
  const db = provisionDb(calls);
  const permissions = [
    'workspace:create',
    'channel:create',
    'connector:create',
    'signal:create',
    'watch:create',
    'subscriber:create',
  ];
  const payload = {
    workspace: {
      workspace_key: 'demo:tenant_1',
      name: 'Demo Tenant',
      source_app: 'demo',
      external_tenant_id: 'tenant_1',
      external_user_id: 'user_1',
    },
    channel: {
      channel_key: 'demo:tenant_1:forecast:one',
      name: 'Forecast One',
      purpose: 'forecast',
    },
    connector: {
      connector_key: 'ck_demo_tenant_1_forecast_one',
    },
    signals: [
      {
        signal_key: 'forecast.revenue.pace',
        description: 'Forecast pace',
      },
    ],
    watches: [
      {
        signal_key: 'forecast.revenue.pace',
        watch_key: 'pace_warning',
        name: 'Forecast pace warning',
        watch_type: 'LAST_VALUE_LT',
        config: { threshold: 85, severity: 'warning' },
      },
    ],
    subscribers: [
      {
        subscriber_type: 'email',
        destination_url: 'martin@example.com',
        mode: 'alert',
      },
    ],
    workspace_subscribers: [
      {
        subscriber_type: 'webhook',
        destination_url: 'https://example.com/heads-up',
        mode: 'alert',
      },
    ],
  };

  const first = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: payload,
    now: '2026-05-24T10:00:00.000Z',
  });
  const second = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: payload,
    now: '2026-05-24T10:01:00.000Z',
  });

  assert.equal(first.ok, true);
  assert.equal(first.created.workspace, true);
  assert.equal(first.created.channel, true);
  assert.equal(first.created.connector, true);
  assert.equal(first.created.signals, 1);
  assert.equal(first.created.watches, 1);
  assert.equal(first.created.subscribers, 1);
  assert.equal(first.created.workspace_subscribers, 1);
  assert.equal(first.secret_returned, true);
  assert.equal(first.signals[0].signal_key, 'forecast.revenue.pace');
  assert.equal(first.watches[0].signal_id, first.signals[0].id);
  assert.equal(first.workspace_subscribers[0].subscriber_scope, 'workspace');
  assert.equal(first.workspace_subscribers[0].channel_id, null);

  assert.equal(second.ok, true);
  assert.equal(second.created.workspace, false);
  assert.equal(second.reused.workspace, true);
  assert.equal(second.created.connector, false);
  assert.equal(second.secret_returned, false);
  assert.equal(second.created.signals, 0);
  assert.equal(second.reused.signals, 1);
  assert.equal(db.tables.workspaces.length, 1);
  assert.equal(db.tables.channels.length, 1);
  assert.equal(db.tables.connectors.length, 1);
  assert.equal(db.tables.signals.length, 1);
  assert.equal(db.tables.watches.length, 1);
  assert.equal(db.tables.subscribers.length, 2);
});

test('admin provisionChannel creates grouped watch policy bands idempotently', async () => {
  const db = provisionDb();
  const permissions = [
    'workspace:create',
    'channel:create',
    'connector:create',
    'signal:create',
    'watch:create',
    'subscriber:create',
  ];
  const payload = {
    workspace: {
      workspace_key: 'demo:tenant_group',
      name: 'Grouped Tenant',
      source_app: 'demo',
      external_tenant_id: 'tenant_group',
      external_user_id: 'user_group',
    },
    channel: {
      channel_key: 'demo:tenant_group:forecast:one',
      name: 'Forecast One',
    },
    signals: [{ signal_key: 'forecast.revenue.pace' }],
    watch_groups: [
      {
        group_key: 'forecast_pace_health',
        name: 'Forecast pace health',
        signal_key: 'forecast.revenue.pace',
        winner_policy: 'highest_severity_wins',
        cooldown_seconds: 3600,
        recovery: { condition: 'value >= 95', severity: 'recovery' },
        bands: [
          {
            band_key: 'critical',
            severity: 'critical',
            watch_type: 'LAST_VALUE_LT',
            config: { threshold: 70 },
          },
          {
            band_key: 'warning',
            severity: 'warning',
            watch_type: 'LAST_VALUE_LT',
            config: { threshold: 85 },
          },
        ],
      },
    ],
  };

  const first = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: payload,
    now: '2026-05-24T10:00:00.000Z',
  });
  const second = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: payload,
    now: '2026-05-24T10:01:00.000Z',
  });

  assert.equal(first.ok, true);
  assert.equal(first.created.watch_groups, 1);
  assert.equal(first.created.watches, 2);
  assert.equal(first.watch_groups[0].group_key, 'forecast_pace_health');
  assert.equal(first.watch_groups[0].watches.length, 2);
  assert.equal(first.watch_groups[0].watches[0].watch_group_id, first.watch_groups[0].watch_group_id);
  assert.equal(first.watch_groups[0].watches[0].band_key, 'critical');
  assert.equal(second.ok, true);
  assert.equal(second.created.watch_groups, 0);
  assert.equal(second.reused.watch_groups, 1);
  assert.equal(second.created.watches, 0);
  assert.equal(second.reused.watches, 2);
  assert.equal(db.tables.watch_groups.length, 1);
  assert.equal(db.tables.watches.length, 2);
});

test('admin provisionChannel disables replaced legacy ungrouped watches when grouped policy is provisioned', async () => {
  const db = provisionDb();
  const permissions = ['workspace:create', 'channel:create', 'connector:create', 'signal:create', 'watch:create', 'subscriber:create'];
  const base = {
    workspace: {
      workspace_key: 'demo:tenant_reconcile',
      name: 'Reconcile Tenant',
      source_app: 'demo',
      external_tenant_id: 'tenant_reconcile',
      external_user_id: 'user_reconcile',
    },
    channel: { channel_key: 'demo:tenant_reconcile:forecast:one', name: 'Forecast One' },
    signals: [{ signal_key: 'forecast.revenue.pace' }],
  };
  const legacy = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: {
      ...base,
      watches: [
        {
          signal_key: 'forecast.revenue.pace',
          watch_id: 'foretic:user:1:forecast:forecast_1:pace:warning',
          name: 'Pace warning legacy',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 90, severity: 'warning' },
        },
        {
          signal_key: 'forecast.revenue.pace',
          watch_id: 'foretic:user:1:forecast:forecast_1:pace:critical',
          name: 'Pace critical legacy',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 70, severity: 'critical' },
        },
        {
          signal_key: 'forecast.revenue.pace',
          watch_id: 'foretic:user:1:forecast:forecast_1:pace:ahead',
          name: 'Pace ahead',
          watch_type: 'LAST_VALUE_GT',
          config: { threshold: 110, severity: 'info' },
        },
      ],
    },
    now: '2026-05-24T10:00:00.000Z',
  });
  const grouped = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: {
      ...base,
      watch_groups: [
        {
          group_key: 'forecast_pace_health',
          signal_key: 'forecast.revenue.pace',
          replaces: { watch_id_patterns: [':pace:warning', ':pace:critical'] },
          bands: [
            { band_key: 'critical', severity: 'critical', watch_type: 'LAST_VALUE_LT', config: { threshold: 70 } },
            { band_key: 'warning', severity: 'warning', watch_type: 'LAST_VALUE_LT', config: { threshold: 85 } },
          ],
        },
      ],
    },
    now: '2026-05-24T10:01:00.000Z',
  });
  const rerun = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: {
      ...base,
      watch_groups: [
        {
          group_key: 'forecast_pace_health',
          signal_key: 'forecast.revenue.pace',
          replaces: { watch_id_patterns: [':pace:warning', ':pace:critical'] },
          bands: [
            { band_key: 'critical', severity: 'critical', watch_type: 'LAST_VALUE_LT', config: { threshold: 70 } },
            { band_key: 'warning', severity: 'warning', watch_type: 'LAST_VALUE_LT', config: { threshold: 85 } },
          ],
        },
      ],
    },
    now: '2026-05-24T10:02:00.000Z',
  });

  assert.equal(legacy.ok, true);
  assert.equal(grouped.ok, true);
  assert.equal(grouped.reconciled.disabled_watches, 2);
  assert.equal(rerun.reconciled.disabled_watches, 0);
  assert.equal(db.tables.watches.find((row) => row.watch_id.endsWith(':pace:warning')).enabled, 0);
  assert.equal(db.tables.watches.find((row) => row.watch_id.endsWith(':pace:critical')).enabled, 0);
  assert.equal(db.tables.watches.find((row) => row.watch_id.endsWith(':pace:ahead')).enabled, 1);
  assert.equal(db.tables.watches.filter((row) => row.watch_group_id).length, 2);
});

test('admin provisionChannel rejects duplicate watch group band keys', async () => {
  const db = provisionDb();
  const permissions = [
    'workspace:create',
    'channel:create',
    'connector:create',
    'signal:create',
    'watch:create',
    'subscriber:create',
  ];
  const result = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: {
      workspace: {
        workspace_key: 'demo:tenant_dup_group',
        name: 'Grouped Tenant',
        source_app: 'demo',
        external_tenant_id: 'tenant_dup_group',
        external_user_id: 'user_group',
      },
      channel: {
        channel_key: 'demo:tenant_dup_group:forecast:one',
        name: 'Forecast One',
      },
      signals: [{ signal_key: 'forecast.revenue.pace' }],
      watch_groups: [
        {
          group_key: 'forecast_pace_health',
          signal_key: 'forecast.revenue.pace',
          bands: [
            { band_key: 'warning', severity: 'warning', watch_type: 'LAST_VALUE_LT', config: { threshold: 85 } },
            { band_key: 'warning', severity: 'critical', watch_type: 'LAST_VALUE_LT', config: { threshold: 70 } },
          ],
        },
      ],
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROVISION_STEP_FAILED');
  assert.equal(result.details.section, 'watch_groups');
  assert.equal(result.details.group_key, 'forecast_pace_health');
  assert.equal(result.details.signal_key, 'forecast.revenue.pace');
  assert.equal(result.details.band_index, 1);
  assert.equal(result.details.band_key, 'warning');
  assert.equal(result.details.cause.code, 'DUPLICATE_BAND_KEY');
});

test('admin provisionChannel upserts subscriber filters by subscriber_key', async () => {
  const db = provisionDb();
  const permissions = [
    'workspace:create',
    'channel:create',
    'connector:create',
    'signal:create',
    'watch:create',
    'subscriber:create',
  ];
  const base = {
    workspace: {
      workspace_key: 'demo:tenant_filter',
      name: 'Filter Tenant',
      source_app: 'demo',
      external_tenant_id: 'tenant_filter',
      external_user_id: 'user_filter',
    },
    channel: {
      channel_key: 'demo:tenant_filter:forecast:one',
      name: 'Forecast One',
    },
    signals: [{ signal_key: 'forecast.revenue.pace' }, { signal_key: 'forecast.goal.risk' }],
    subscribers: [
      {
        subscriber_key: 'foretic:forecast_1:board@example.com',
        subscriber_type: 'email',
        destination_url: 'board@example.com',
        mode: 'alert',
        config: {
          template_id: 'forecast_alert_v1',
          filters: { signal_keys: ['forecast.goal.risk'] },
        },
      },
    ],
  };

  const first = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: base,
    now: '2026-05-24T10:00:00.000Z',
  });
  const second = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: {
      ...base,
      subscribers: [
        {
          ...base.subscribers[0],
          config: {
            template_id: 'forecast_alert_v1',
            filters: { signal_keys: ['forecast.revenue.pace', 'forecast.goal.risk'] },
          },
        },
      ],
    },
    now: '2026-05-24T10:01:00.000Z',
  });

  assert.equal(first.ok, true);
  assert.equal(first.created.subscribers, 1);
  assert.equal(second.ok, true);
  assert.equal(second.updated.subscribers, 1);
  assert.deepEqual(second.subscribers[0].config.filters.signal_keys, ['forecast.revenue.pace', 'forecast.goal.risk']);
  assert.equal(db.tables.subscribers.length, 1);
});

test('admin provisionChannel rejects email destination changes for same subscriber_key', async () => {
  const db = provisionDb();
  const permissions = [
    'workspace:create',
    'channel:create',
    'connector:create',
    'signal:create',
    'watch:create',
    'subscriber:create',
  ];
  const payload = {
    workspace: {
      workspace_key: 'demo:tenant_filter_destination',
      name: 'Filter Tenant',
      source_app: 'demo',
      external_tenant_id: 'tenant_filter_destination',
      external_user_id: 'user_filter',
    },
    channel: {
      channel_key: 'demo:tenant_filter_destination:forecast:one',
      name: 'Forecast One',
    },
    subscribers: [
      {
        subscriber_key: 'foretic:forecast_1:board',
        subscriber_type: 'email',
        destination_url: 'board@example.com',
        mode: 'alert',
        config: { template_id: 'forecast_alert_v1' },
      },
    ],
  };

  await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: payload,
    now: '2026-05-24T10:00:00.000Z',
  });
  const result = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: {
      ...payload,
      subscribers: [
        {
          ...payload.subscribers[0],
          destination_url: 'new-board@example.com',
        },
      ],
    },
    now: '2026-05-24T10:01:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.details.section, 'subscribers');
  assert.equal(result.details.cause.code, 'VALIDATION_ERROR');
});

test('admin provisionChannel auto-creates missing signal_key referenced by watch', async () => {
  const db = provisionDb();
  const permissions = [
    'workspace:create',
    'channel:create',
    'connector:create',
    'signal:create',
    'watch:create',
    'subscriber:create',
  ];
  const result = await provisionAdminChannel({
    auth: { user_id: 'user_admin', permissions },
    db,
    input: {
      workspace: {
        workspace_key: 'demo:tenant_2',
        name: 'Demo Tenant 2',
        source_app: 'demo',
        external_tenant_id: 'tenant_2',
        external_user_id: 'user_2',
      },
      channel: {
        channel_key: 'demo:tenant_2:forecast:one',
        name: 'Forecast One',
      },
      watches: [
        {
          signal_key: 'missing.signal',
          name: 'Missing signal watch',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 1 },
        },
      ],
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created.signals, 1);
  assert.equal(result.watches.length, 1);
  assert.equal(result.signals[0].signal_key, 'missing.signal');
  assert.equal(result.watches[0].signal_id, result.signals[0].id);
});

test('admin channel read returns metadata', async () => {
  const result = await getAdminChannel({
    auth: { user_id: 'user_admin', permissions: ['channel:read'] },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123' },
      channel: {
        id: 'ch_123',
        channel_id: 'ch_123',
        workspace_id: 'ws_123',
        name: 'Demo Channel',
        purpose: null,
        metadata_json: '{"forecast_id":"fc_123"}',
      },
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.channel.channel_id, 'ch_123');
  assert.deepEqual(result.channel.metadata, { forecast_id: 'fc_123' });
});

test('admin channel update patches metadata', async () => {
  const calls = [];
  const result = await updateAdminChannel({
    auth: { user_id: 'user_admin', permissions: ['channel:update'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123' },
        channel: {
          id: 'ch_123',
          channel_id: 'ch_123',
          workspace_id: 'ws_123',
          name: 'Demo Channel',
          purpose: 'initial',
          metadata_json: '{"forecast_id":"fc_123"}',
        },
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      metadata: { forecast_id: 'fc_456', user_id: 'user_2' },
    },
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.channel.metadata, { forecast_id: 'fc_456', user_id: 'user_2' });
  assert.equal(calls.some((call) => /UPDATE channels/.test(call.sql)), true);
});

test('admin signal creation can persist a contract', async () => {
  const calls = [];
  const result = await createAdminSignal({
    auth,
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123' },
        channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      signal_key: 'forecast.revenue.pace',
      contract: { default_bucket_types: ['hour'], dimensions: ['forecast_id'] },
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  const insertCalls = calls.filter((call) => /INSERT OR IGNORE/.test(call.sql));
  assert.equal(insertCalls.length, 2);
  assert.match(insertCalls[1].sql, /INSERT OR IGNORE INTO signal_contracts/);
});

test('channel contract creation archives the active version and inserts the next version', async () => {
  const calls = [];
  const result = await createAdminChannelContract({
    auth: { user_id: 'user_admin', permissions: ['channel_contract:create'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_1' },
        channel: {
          id: 'ch_123',
          channel_id: 'ch_123',
          workspace_id: 'ws_123',
          source_app: 'demo',
          external_tenant_id: 'tenant_1',
        },
        channelContract: {
          id: 'chct_old',
          channel_contract_id: 'chct_old',
          workspace_id: 'ws_123',
          channel_id: 'ch_123',
          version: 1,
          status: 'active',
          expected_signal_types_json: '[]',
          default_dimensions_json: '[]',
          default_watch_templates_json: '[]',
          cta_policy_json: '{}',
        },
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      purpose: 'Forecast attention',
      expected_signal_types: ['forecast_state'],
      default_dimensions: ['forecast_id'],
      default_watch_templates: [{ name: 'Pace low', watch_type: 'LAST_VALUE_LT', config: { threshold: 85 } }],
      cta_policy: { required: true },
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.channel_contract.version, 2);
  assert.deepEqual(result.channel_contract.default_dimensions, ['forecast_id']);
  assert.match(calls.find((call) => /UPDATE channel_contracts/.test(call.sql)).sql, /status = \?/);
  assert.match(calls.find((call) => /INSERT OR IGNORE INTO channel_contracts/.test(call.sql)).sql, /channel_contracts/);
});

test('channel contract update rejects invalid templates before writing', async () => {
  const calls = [];
  const result = await updateAdminChannelContract({
    auth: { user_id: 'user_admin', permissions: ['channel_contract:update'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123' },
        channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      default_watch_templates: [{ name: 'Missing type' }],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_CHANNEL_CONTRACT');
  assert.equal(calls.some((call) => /INSERT OR IGNORE INTO channel_contracts/.test(call.sql)), false);
});

test('channel contract reads are tenant scoped', async () => {
  const result = await getAdminChannelContract({
    auth: {
      user_id: 'user_admin',
      permissions: ['channel_contract:read'],
      source_app: 'demo',
      external_tenant_id: 'tenant_b',
    },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_a' },
      channel: {
        id: 'ch_123',
        channel_id: 'ch_123',
        workspace_id: 'ws_123',
        source_app: 'demo',
        external_tenant_id: 'tenant_a',
      },
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TENANT_SCOPE_MISMATCH');
});

test('connector row includes one-time secret material', () => {
  const row = buildConnectorRow(
    { workspace_id: 'ws_123', channel_id: 'ch_123', connector_type: 'webhook' },
    '2026-05-24T10:00:00.000Z',
    () => 'hu_sec_test',
  );

  assert.equal(row.connector_secret, 'hu_sec_test');
  assert.equal(row.enabled, 1);
});

test('subscriber row validates and redacts destination URL', () => {
  const built = buildSubscriberRow({
    workspace_id: 'ws_123',
    channel_id: 'ch_123',
    subscriber_type: 'webhook',
    destination_url: 'https://api.example.com/hooks/abc123',
  });

  assert.equal(built.ok, true);
  assert.equal(built.row.destination_url_redacted, 'https://api.example.com/hooks/abc123/...');
  assert.equal(built.row.normalized_destination, 'https://api.example.com/hooks/abc123');
});

test('subscriber row validates email destination and normalizes recipient', () => {
  const built = buildSubscriberRow({
    workspace_id: 'ws_123',
    channel_id: 'ch_123',
    subscriber_type: 'email',
    destination_url: 'Martin@example.com',
    config: { to: ['ops@example.com'] },
  });

  assert.equal(built.ok, true);
  assert.equal(built.row.normalized_destination, 'martin@example.com');
  assert.match(built.row.destination_url_redacted, /^ma\*\*\*@example\.com$/);
});

test('email subscriber authorization starts disabled and pending when required', () => {
  const built = buildSubscriberRow(
    {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      subscriber_type: 'email',
      destination_url: 'martin@example.com',
      config: { authorization: { required: true } },
    },
    '2026-05-26T00:00:00.000Z',
  );

  assert.equal(built.ok, true);
  assert.equal(built.row.enabled, 0);
  const config = JSON.parse(built.row.config_json);
  assert.equal(config.authorization.status, 'pending');
  assert.equal(config.authorization.requested_at, '2026-05-26T00:00:00.000Z');
});

test('email subscriber authorization is not default', () => {
  const built = buildSubscriberRow({
    workspace_id: 'ws_123',
    channel_id: 'ch_123',
    subscriber_type: 'email',
    destination_url: 'martin@example.com',
    config: {},
  });

  assert.equal(built.ok, true);
  assert.equal(built.row.enabled, 1);
});

test('watch row serializes config JSON', () => {
  const row = buildWatchRow({
    workspace_id: 'ws_123',
    channel_id: 'ch_123',
    signal_id: 'sig_123',
    name: 'Pace behind',
    watch_type: 'LAST_VALUE_LT',
    config: { threshold: 85 },
  });

  assert.deepEqual(JSON.parse(row.config_json), { threshold: 85 });
});

test('channel contract row serializes contract fields', () => {
  const row = buildChannelContractRow(
    {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      default_dimensions: ['forecast_id'],
      cta_policy: { required: true },
    },
    1,
    '2026-05-24T10:00:00.000Z',
  );

  assert.equal(row.version, 1);
  assert.deepEqual(JSON.parse(row.default_dimensions_json), ['forecast_id']);
  assert.deepEqual(JSON.parse(row.cta_policy_json), { required: true });
});

test('admin connector writes connector metadata to KV store', async () => {
  const writes = [];
  const result = await createAdminConnector({
    auth: { user_id: 'user_admin', permissions: ['connector:create'] },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_1' },
      channel: {
        id: 'ch_123',
        channel_id: 'ch_123',
        workspace_id: 'ws_123',
        source_app: 'demo',
        external_tenant_id: 'tenant_1',
      },
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', connector_type: 'webhook' },
    secretFactory: () => 'hu_sec_test',
    store: {
      async put(type, key, value) {
        writes.push({ type, key, value });
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(writes[0].type, 'connector_by_key');
  assert.equal(writes[0].value.connector_secret, 'hu_sec_test');
});

test('admin connector duplicate create returns existing connector without a fresh secret', async () => {
  const result = await createAdminConnector({
    auth: { user_id: 'user_admin', permissions: ['connector:create'] },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_1' },
      channel: {
        id: 'ch_123',
        channel_id: 'ch_123',
        workspace_id: 'ws_123',
        source_app: 'demo',
        external_tenant_id: 'tenant_1',
      },
      connector: {
        id: 'conn_123',
        connector_id: 'conn_123',
        workspace_id: 'ws_123',
        channel_id: 'ch_123',
        connector_type: 'webhook',
        connector_key: 'ck_existing',
        connector_secret: 'hu_sec_existing',
        enabled: 1,
      },
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', connector_type: 'webhook', connector_key: 'ck_existing' },
    secretFactory: () => 'hu_sec_new_should_not_return',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.secret_returned, false);
  assert.equal(result.connector.connector_key, 'ck_existing');
  assert.equal(result.connector.connector_secret, undefined);
});

test('admin get subscriber returns authorization status after confirmation', async () => {
  const result = await getAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:read'] },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'foretic', external_tenant_id: 'user:123' },
      channel: {
        id: 'ch_123',
        channel_id: 'ch_123',
        workspace_id: 'ws_123',
        source_app: 'foretic',
        external_tenant_id: 'user:123',
      },
      subscriber: {
        id: 'sub_123',
        subscriber_id: 'sub_123',
        workspace_id: 'ws_123',
        channel_id: 'ch_123',
        subscriber_type: 'email',
        destination_url: 'martin@example.com',
        normalized_destination: 'martin@example.com',
        destination_url_redacted: 'ma***@example.com',
        mode: 'alert',
        enabled: 1,
        source_app: 'foretic',
        external_tenant_id: 'user:123',
        config_json: JSON.stringify({
          authorization: {
            required: true,
            status: 'authorized',
            requested_at: '2026-05-26T00:00:00.000Z',
            authorized_at: '2026-05-26T00:05:00.000Z',
          },
        }),
        created_at: '2026-05-26T00:00:00.000Z',
        updated_at: '2026-05-26T00:05:00.000Z',
      },
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', subscriber_id: 'sub_123' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscriber.enabled, 1);
  assert.equal(result.subscriber.config.authorization.status, 'authorized');
  assert.equal(result.subscriber.config.authorization.authorized_at, '2026-05-26T00:05:00.000Z');
  assert.equal(result.subscriber.destination_url, undefined);
});

test('admin get subscriber supports email lookup and returns pending authorization', async () => {
  const result = await getAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:update'] },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123' },
      channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
      subscribers: [
        {
          id: 'sub_123',
          subscriber_id: 'sub_123',
          workspace_id: 'ws_123',
          channel_id: 'ch_123',
          subscriber_type: 'email',
          destination_url: 'martin@example.com',
          normalized_destination: 'martin@example.com',
          mode: 'alert',
          enabled: 0,
          config_json: JSON.stringify({
            authorization: {
              required: true,
              status: 'pending',
              requested_at: '2026-05-26T00:00:00.000Z',
            },
          }),
          created_at: '2026-05-26T00:00:00.000Z',
          updated_at: '2026-05-26T00:00:00.000Z',
        },
      ],
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', email: 'MARTIN@example.com', mode: 'alert' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscriber.enabled, 0);
  assert.equal(result.subscriber.config.authorization.status, 'pending');
});

test('admin list subscribers returns safe channel subscribers', async () => {
  const result = await listAdminSubscribers({
    auth: { user_id: 'user_admin', permissions: ['subscriber:read'] },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123' },
      channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
      subscribers: [
        {
          id: 'sub_123',
          subscriber_id: 'sub_123',
          workspace_id: 'ws_123',
          channel_id: 'ch_123',
          subscriber_type: 'email',
          destination_url: 'martin@example.com',
          normalized_destination: 'martin@example.com',
          mode: 'alert',
          enabled: 1,
          config_json: JSON.stringify({ authorization: { required: true, status: 'authorized' } }),
          created_at: '2026-05-26T00:00:00.000Z',
          updated_at: '2026-05-26T00:05:00.000Z',
        },
      ],
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', subscriber_type: 'email' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscribers.length, 1);
  assert.equal(result.subscribers[0].subscriber_id, 'sub_123');
  assert.equal(result.subscribers[0].config.authorization.status, 'authorized');
});

test('admin subscriber rejects channel from another workspace', async () => {
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_b', channel_id: 'ch_b', workspace_id: 'ws_b' },
    }),
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_b',
      subscriber_type: 'webhook',
      destination_url: 'https://example.com/hook',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WORKSPACE_CHANNEL_MISMATCH');
});

test('admin disable subscriber supports lookup by email and mode', async () => {
  const calls = [];
  const result = await disableAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:update'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123' },
        channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
        subscribers: [
          {
            id: 'sub_123',
            subscriber_id: 'sub_123',
            workspace_id: 'ws_123',
            channel_id: 'ch_123',
            subscriber_type: 'email',
            destination_url: 'martin@example.com',
            normalized_destination: 'martin@example.com',
            mode: 'alert',
            enabled: 1,
          },
        ],
      },
      calls,
    ),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', email: 'MARTIN@example.com', mode: 'alert' },
    now: '2026-05-24T10:10:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscriber.enabled, 0);
  assert.ok(calls.some((call) => /UPDATE subscribers SET enabled = 0/.test(call.sql)));
});

test('admin delete subscriber supports lookup by subscriber_id', async () => {
  const calls = [];
  const result = await deleteAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:delete'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123' },
        channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
        subscriber: {
          id: 'sub_123',
          subscriber_id: 'sub_123',
          workspace_id: 'ws_123',
          channel_id: 'ch_123',
          subscriber_type: 'email',
          destination_url: 'martin@example.com',
          mode: 'alert',
        },
      },
      calls,
    ),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', subscriber_id: 'sub_123' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.deleted, true);
  assert.ok(calls.some((call) => /DELETE FROM subscribers/.test(call.sql)));
});

test('admin watch rejects signal outside channel scope', async () => {
  const result = await createAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      signal: { id: 'sig_b', signal_id: 'sig_b', workspace_id: 'ws_a', channel_id: 'ch_b' },
    }),
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      signal_id: 'sig_b',
      name: 'Bad watch',
      watch_type: 'LAST_VALUE_GT',
      config: { threshold: 10 },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SIGNAL_SCOPE_MISMATCH');
});

test('admin updateWatch disables a watch and reports the change', async () => {
  const calls = [];
  const result = await updateAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:update'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_a', workspace_id: 'ws_a' },
        channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
        watch: {
          id: 'watch_a',
          watch_id: 'watch_a',
          workspace_id: 'ws_a',
          channel_id: 'ch_a',
          signal_id: 'sig_a',
          name: 'Pace warning',
          watch_type: 'LAST_VALUE_GT',
          config_json: '{"threshold":10}',
          cooldown_seconds: 3600,
          enabled: 1,
        },
      },
      calls,
    ),
    input: { workspace_id: 'ws_a', channel_id: 'ch_a', watch_id: 'watch_a', enabled: false },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.ok(calls.some((call) => /UPDATE watches/.test(call.sql)));
});

test('admin updateWatch is allowed for existing watch:create keys before rotation', async () => {
  const result = await updateAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      watch: { id: 'watch_a', watch_id: 'watch_a', workspace_id: 'ws_a', channel_id: 'ch_a', enabled: 1, cooldown_seconds: 60 },
    }),
    input: { workspace_id: 'ws_a', channel_id: 'ch_a', watch_id: 'watch_a', name: 'Renamed' },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
});

test('admin updateWatch denies cross-tenant updates', async () => {
  const result = await updateAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:update'], external_tenant_id: 'tenant_1' },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a', external_tenant_id: 'tenant_2' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a', external_tenant_id: 'tenant_2' },
      watch: { id: 'watch_a', watch_id: 'watch_a', workspace_id: 'ws_a', channel_id: 'ch_a', external_tenant_id: 'tenant_2', enabled: 1 },
    }),
    input: { workspace_id: 'ws_a', channel_id: 'ch_a', watch_id: 'watch_a', enabled: false },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TENANT_SCOPE_MISMATCH');
});

test('admin updateWatch requires watch_id', async () => {
  const result = await updateAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:update'] },
    db: scopedDb({ workspace: { id: 'ws_a', workspace_id: 'ws_a' }, channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' } }),
    input: { workspace_id: 'ws_a', channel_id: 'ch_a' },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'VALIDATION_ERROR');
});

test('admin createWorkspace returns the stored row and created:false on repeat', async () => {
  const result = await createAdminWorkspace({
    auth: { user_id: 'user_admin', permissions: ['workspace:create'] },
    db: scopedDb({ workspace: { id: 'ws_a', workspace_id: 'ws_a', workspace_key: 'demo:acme' } }),
    input: { name: 'Acme', source_app: 'demo', external_tenant_id: 'tenant_1', external_user_id: 'user_1', workspace_key: 'demo:acme' },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.workspace.workspace_id, 'ws_a');
});

test('admin createWatch returns the stored watch and created:false on repeat', async () => {
  const result = await createAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      signal: { id: 'sig_a', signal_id: 'sig_a', workspace_id: 'ws_a', channel_id: 'ch_a' },
      watch: { id: 'watch_a', watch_id: 'watch_a', workspace_id: 'ws_a', channel_id: 'ch_a' },
    }),
    input: { workspace_id: 'ws_a', channel_id: 'ch_a', signal_id: 'sig_a', name: 'Pace high', watch_type: 'LAST_VALUE_GT', watch_id: 'watch_a' },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.watch.watch_id, 'watch_a');
});

test('admin createSubscriber is idempotent and does not resend authorization on repeat', async () => {
  let authEmails = 0;
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      subscriber: {
        id: 'sub_a',
        subscriber_id: 'sub_a',
        workspace_id: 'ws_a',
        channel_id: 'ch_a',
        subscriber_type: 'email',
        normalized_destination: 'board@example.com',
        config_json: JSON.stringify({ authorization: { required: true, status: 'authorized' } }),
        enabled: 1,
      },
    }),
    env: { sendAuthorizationEmailFn: () => { authEmails += 1; } },
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_type: 'email',
      destination_url: 'board@example.com',
      mode: 'alert',
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.authorization, null);
  assert.equal(authEmails, 0);
});

test('admin createSubscriber upsert reuses authorized email by destination even with different subscriber_key', async () => {
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      subscribers: [
        {
          id: 'sub_existing',
          subscriber_id: 'sub_existing',
          workspace_id: 'ws_a',
          channel_id: 'ch_a',
          subscriber_scope: 'channel',
          subscriber_type: 'email',
          name: 'Webhook subscriber',
          destination_url: 'board@example.com',
          normalized_destination: 'board@example.com',
          mode: 'alert',
          enabled: 1,
          config_json: JSON.stringify({ authorization: { required: true, status: 'authorized' } }),
          created_at: '2026-05-24T10:00:00.000Z',
          updated_at: '2026-05-24T10:01:00.000Z',
        },
      ],
    }),
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_key: 'new-key-for-same-email',
      subscriber_type: 'email',
      destination_url: 'board@example.com',
      mode: 'alert',
      upsert_existing: true,
      config: { authorization: { required: true } },
    },
    now: '2026-05-24T10:02:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.authorization, null);
  assert.equal(result.subscriber.subscriber_id, 'sub_existing');
  assert.equal(result.subscriber.config.authorization.status, 'authorized');
});

test('admin createSubscriber upsert reuses authorized email when normalized_destination is missing', async () => {
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      subscribers: [
        {
          id: 'sub_legacy',
          subscriber_id: 'sub_legacy',
          workspace_id: 'ws_a',
          channel_id: 'ch_a',
          subscriber_scope: 'channel',
          subscriber_type: 'email',
          name: 'Legacy Subscriber',
          destination_url: 'Board@Example.com',
          normalized_destination: null,
          mode: 'alert',
          enabled: 1,
          config_json: JSON.stringify({ authorization: { required: true, status: 'authorized' } }),
          created_at: '2026-05-24T10:00:00.000Z',
          updated_at: '2026-05-24T10:01:00.000Z',
        },
      ],
    }),
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_key: 'new-key-same-legacy-email',
      subscriber_type: 'email',
      destination_url: 'board@example.com',
      mode: 'alert',
      upsert_existing: true,
      config: { authorization: { required: true } },
    },
    now: '2026-05-24T10:02:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.subscriber.subscriber_id, 'sub_legacy');
  assert.equal(result.subscriber.config.authorization.status, 'authorized');
});

test('admin createSubscriber upsert prefers authorized destination match over pending exact key', async () => {
  const rows = [
    {
      id: 'sub_pending_exact',
      subscriber_id: 'sub_pending_exact',
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Pending Subscriber',
      destination_url: 'board@example.com',
      normalized_destination: 'board@example.com',
      mode: 'alert',
      enabled: 0,
      config_json: JSON.stringify({ authorization: { required: true, status: 'pending', requested_at: '2026-05-24T10:01:00.000Z' } }),
      created_at: '2026-05-24T10:01:00.000Z',
      updated_at: '2026-05-24T10:01:00.000Z',
    },
    {
      id: 'sub_authorized_destination',
      subscriber_id: 'sub_authorized_destination',
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Authorized Subscriber',
      destination_url: 'board@example.com',
      normalized_destination: 'board@example.com',
      mode: 'alert',
      enabled: 1,
      config_json: JSON.stringify({
        authorization: {
          required: true,
          status: 'authorized',
          requested_at: '2026-05-24T09:00:00.000Z',
          authorized_at: '2026-05-24T09:05:00.000Z',
        },
      }),
      created_at: '2026-05-24T09:00:00.000Z',
      updated_at: '2026-05-24T09:05:00.000Z',
    },
  ];
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      subscriber: rows[0],
      subscribers: rows,
    }),
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_id: 'sub_pending_exact',
      subscriber_type: 'email',
      destination_url: 'board@example.com',
      mode: 'alert',
      upsert_existing: true,
      config: { authorization: { required: true } },
    },
    now: '2026-05-24T10:02:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.subscriber.subscriber_id, 'sub_authorized_destination');
  assert.equal(result.subscriber.config.authorization.status, 'authorized');
});

test('admin createSubscriber upsert keeps one authorized same-destination email enabled', async () => {
  const rows = [
    {
      id: 'sub_disabled_exact',
      subscriber_id: 'sub_disabled_exact',
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Disabled Exact Subscriber',
      destination_url: 'board@example.com',
      normalized_destination: 'board@example.com',
      mode: 'alert',
      enabled: 0,
      config_json: JSON.stringify({
        authorization: {
          required: true,
          status: 'authorized',
          requested_at: '2026-05-24T10:01:00.000Z',
          authorized_at: '2026-05-24T10:05:00.000Z',
        },
      }),
      created_at: '2026-05-24T10:01:00.000Z',
      updated_at: '2026-05-24T10:05:00.000Z',
    },
  ];
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      subscriber: rows[0],
      subscribers: rows,
    }),
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_id: 'sub_disabled_exact',
      subscriber_type: 'email',
      destination_url: 'board@example.com',
      mode: 'alert',
      upsert_existing: true,
      config: { authorization: { required: true } },
    },
    now: '2026-05-24T10:10:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscriber.subscriber_id, 'sub_disabled_exact');
  assert.equal(result.subscriber.enabled, 1);
  assert.equal(result.subscriber.config.authorization.status, 'authorized');
});

test('admin getSubscriber resolves pending exact id to authorized same-destination subscriber', async () => {
  const rows = [
    {
      id: 'sub_pending_exact',
      subscriber_id: 'sub_pending_exact',
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Pending Subscriber',
      destination_url: 'board@example.com',
      normalized_destination: 'board@example.com',
      mode: 'alert',
      enabled: 0,
      config_json: JSON.stringify({ authorization: { required: true, status: 'pending' } }),
      created_at: '2026-05-24T10:00:00.000Z',
      updated_at: '2026-05-24T10:00:00.000Z',
    },
    {
      id: 'sub_authorized',
      subscriber_id: 'sub_authorized',
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Authorized Subscriber',
      destination_url: 'Board@Example.com',
      normalized_destination: null,
      mode: 'alert',
      enabled: 1,
      config_json: JSON.stringify({ authorization: { required: true, status: 'authorized' } }),
      created_at: '2026-05-24T09:00:00.000Z',
      updated_at: '2026-05-24T09:05:00.000Z',
    },
  ];
  const result = await getAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:read'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      subscriber: rows[0],
      subscribers: rows,
    }),
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_id: 'sub_pending_exact',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscriber.subscriber_id, 'sub_authorized');
  assert.equal(result.subscriber.enabled, 1);
  assert.equal(result.subscriber.config.authorization.status, 'authorized');
});

test('admin listSubscribers returns canonical email row for duplicate destination groups', async () => {
  const rows = [
    {
      id: 'sub_pending',
      subscriber_id: 'sub_pending',
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Pending Subscriber',
      destination_url: 'board@example.com',
      normalized_destination: 'board@example.com',
      mode: 'alert',
      enabled: 0,
      config_json: JSON.stringify({ authorization: { required: true, status: 'pending' } }),
      created_at: '2026-05-24T10:00:00.000Z',
      updated_at: '2026-05-24T10:00:00.000Z',
    },
    {
      id: 'sub_authorized',
      subscriber_id: 'sub_authorized',
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Authorized Subscriber',
      destination_url: 'board@example.com',
      normalized_destination: 'board@example.com',
      mode: 'alert',
      enabled: 1,
      config_json: JSON.stringify({ authorization: { required: true, status: 'authorized' } }),
      created_at: '2026-05-24T09:00:00.000Z',
      updated_at: '2026-05-24T09:05:00.000Z',
    },
  ];
  const result = await listAdminSubscribers({
    auth: { user_id: 'user_admin', permissions: ['subscriber:read'] },
    db: scopedDb({
      workspace: { id: 'ws_a', workspace_id: 'ws_a' },
      channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
      subscribers: rows,
    }),
    input: { workspace_id: 'ws_a', channel_id: 'ch_a', subscriber_type: 'email' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscribers.length, 1);
  assert.equal(result.subscribers[0].subscriber_id, 'sub_authorized');
});

test('admin createWatch disables stale duplicate with same logical watch identity', async () => {
  const calls = [];
  const result = await createAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:create'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_a', workspace_id: 'ws_a' },
        channel: { id: 'ch_a', channel_id: 'ch_a', workspace_id: 'ws_a' },
        signal: { id: 'sig_pace', signal_id: 'sig_pace', workspace_id: 'ws_a', channel_id: 'ch_a' },
        watches: [
          {
            id: 'legacy_watch',
            watch_id: 'foretic:user:old:pace:warning',
            workspace_id: 'ws_a',
            channel_id: 'ch_a',
            signal_id: 'sig_pace',
            watch_group_id: null,
            band_key: null,
            name: 'Legacy pace warning',
            watch_type: 'LAST_VALUE_LT',
            config_json: JSON.stringify({ threshold: 85, severity: 'warning' }),
            cooldown_seconds: 3600,
            enabled: 1,
            created_at: '2026-05-24T09:00:00.000Z',
            updated_at: '2026-05-24T09:00:00.000Z',
          },
        ],
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_a',
      channel_id: 'ch_a',
      signal_id: 'sig_pace',
      watch_id: 'ch_a:watch:pace_warning',
      name: 'Forecast pace warning',
      watch_type: 'LAST_VALUE_LT',
      config: { threshold: 85, severity: 'warning' },
      cooldown_seconds: 3600,
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.reconciled.disabled_watches, 1);
  assert.equal(calls.some((call) => /UPDATE watches SET enabled = 0/.test(call.sql)), true);
});

test('dirty Foretic fixture repairs subscriber linkage and creates all default family watches', async () => {
  const db = provisionDb();
  const workspace = {
    id: 'ws_foretic_user_mkfoxvxgoyfbtd',
    workspace_id: 'ws_foretic_user_mkfoxvxgoyfbtd',
    workspace_key: 'foretic:user:mkfoxvxgoyfbtd',
    name: 'Foretic dirty workspace',
    source_app: 'foretic',
    external_tenant_id: 'user:mkfoxvxgoyfbtd',
    external_user_id: 'user:mkfoxvxgoyfbtd',
    status: 'active',
    created_at: '2026-05-24T09:00:00.000Z',
    updated_at: '2026-05-24T09:00:00.000Z',
  };
  const channel = {
    id: 'ch_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mn9cxnv3muoleo',
    channel_id: 'ch_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mn9cxnv3muoleo',
    workspace_id: workspace.workspace_id,
    channel_key: 'foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mn9cxnv3muoleo',
    name: 'Oracle forecast',
    purpose: 'forecast',
    status: 'active',
    source_app: 'foretic',
    external_tenant_id: workspace.external_tenant_id,
    external_user_id: workspace.external_user_id,
    external_resource_id: 'oracle_forecast:mn9cxnv3muoleo',
    metadata_json: '{}',
    created_at: '2026-05-24T09:00:00.000Z',
    updated_at: '2026-05-24T09:00:00.000Z',
  };
  db.tables.workspaces.push(workspace);
  db.tables.channels.push(channel);
  db.tables.subscribers.push(
    {
      id: 'sub_pending_foretic_exact',
      subscriber_id: 'sub_pending_foretic_exact',
      workspace_id: workspace.workspace_id,
      channel_id: channel.channel_id,
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Pending Foretic email',
      destination_url: 'martin@inc64.com',
      normalized_destination: 'martin@inc64.com',
      mode: 'alert',
      enabled: 0,
      config_json: JSON.stringify({ authorization: { required: true, status: 'pending' } }),
      created_at: '2026-05-24T10:00:00.000Z',
      updated_at: '2026-05-24T10:00:00.000Z',
    },
    {
      id: 'sub_authorized_older_generated',
      subscriber_id: 'sub_authorized_older_generated',
      workspace_id: workspace.workspace_id,
      channel_id: channel.channel_id,
      subscriber_scope: 'channel',
      subscriber_type: 'email',
      name: 'Authorized Foretic email',
      destination_url: 'Martin@Inc64.com',
      normalized_destination: null,
      mode: 'alert',
      enabled: 1,
      config_json: JSON.stringify({ authorization: { required: true, status: 'authorized' } }),
      created_at: '2026-05-24T09:00:00.000Z',
      updated_at: '2026-05-24T09:05:00.000Z',
    },
  );

  const definitions = foreticForecastWatchDefinitions({
    channel,
    context: {
      source_app: 'foretic',
      external_tenant_id: workspace.external_tenant_id,
      external_user_id: workspace.external_user_id,
      external_resource_id: channel.external_resource_id,
    },
    now: '2026-05-24T10:10:00.000Z',
  });
  const paceSignalId = stableId('sig', `${channel.channel_id}:forecast.revenue.pace`);
  db.tables.signals.push({
    id: 'sig_legacy_goal',
    signal_id: 'sig_legacy_goal',
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    signal_key: 'forecast.goal.reached',
    signal_type: 'metric',
    value_mode: 'last',
    status: 'active',
    created_at: '2026-05-24T09:00:00.000Z',
    updated_at: '2026-05-24T09:00:00.000Z',
  });
  db.tables.watches.push({
    id: 'legacy_pace_warning',
    watch_id: 'foretic:user:mkfoxvxgoyfbtd:pace:warning',
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    signal_id: paceSignalId,
    watch_group_id: null,
    band_key: null,
    name: 'Legacy pace warning',
    watch_type: 'LAST_VALUE_LT',
    config_json: JSON.stringify({ threshold: 85, severity: 'warning', watch_key: 'pace_warning', family: 'pace' }),
    cooldown_seconds: 3600,
    enabled: 1,
    created_at: '2026-05-24T09:00:00.000Z',
    updated_at: '2026-05-24T09:00:00.000Z',
  });

  const result = await provisionAdminChannel({
    auth: {
      user_id: 'user_admin',
      permissions: ['workspace:create', 'channel:create', 'connector:create', 'signal:create', 'watch:create', 'subscriber:create'],
    },
    db,
    input: {
      workspace_id: workspace.workspace_id,
      channel,
      signals: Array.from(new Set(definitions.map((definition) => definition.signal_key))).map((signal_key) => ({ signal_key })),
      watches: definitions.map((definition) => ({
        signal_key: definition.signal_key,
        watch_id: definition.watch_id,
        watch_key: definition.config?.watch_key,
        name: definition.name,
        watch_type: definition.watch_type,
        config: definition.config,
        cooldown_seconds: definition.cooldown_seconds,
        escalation: definition.escalation_json,
        recovery: definition.recovery_json,
      })),
      subscribers: [
        {
          subscriber_id: 'sub_pending_foretic_exact',
          subscriber_type: 'email',
          destination_url: 'martin@inc64.com',
          mode: 'alert',
          config: { authorization: { required: true } },
        },
      ],
    },
    now: '2026-05-24T10:10:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscribers[0].subscriber_id, 'sub_authorized_older_generated');
  assert.equal(result.subscribers[0].enabled, 1);
  assert.equal(result.subscribers[0].config.authorization.status, 'authorized');
  assert.equal(new Set(result.watches.map((watch) => JSON.parse(watch.config_json || '{}').family)).size, 9);
  assert.equal(result.watches.length, 10);
  assert.equal(db.tables.watches.some((watch) => watch.signal_id === 'sig_legacy_goal' && watch.enabled === 1), true);
});

test('admin signal creation inherits channel contract defaults and materializes watch templates', async () => {
  const calls = [];
  const result = await createAdminSignal({
    auth: { user_id: 'user_admin', permissions: ['signal:create'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123' },
        channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
        channelContract: {
          id: 'chct_123',
          channel_contract_id: 'chct_123',
          workspace_id: 'ws_123',
          channel_id: 'ch_123',
          version: 1,
          status: 'active',
          expected_signal_types_json: '["metric"]',
          default_dimensions_json: '["forecast_id"]',
          default_watch_templates_json: '[{"name":"Pace low","watch_type":"LAST_VALUE_LT","config":{"threshold":85}}]',
          cta_policy_json: '{"required":true}',
        },
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      signal_key: 'forecast.revenue.pace',
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.signal_contract.dimensions, ['forecast_id']);
  assert.deepEqual(result.signal_contract.cta_policy, { required: true });
  assert.equal(result.materialized_watches.length, 1);
  assert.equal(calls.filter((call) => /INSERT(?: OR IGNORE)? INTO watches/.test(call.sql)).length, 1);
});

test('admin snooze watch creates tenant-scoped action control', async () => {
  const calls = [];
  const result = await snoozeAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:control'], source_app: 'demo', external_tenant_id: 'tenant_1' },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_1' },
        channel: {
          id: 'ch_123',
          channel_id: 'ch_123',
          workspace_id: 'ws_123',
          source_app: 'demo',
          external_tenant_id: 'tenant_1',
        },
        watch: { id: 'watch_123', watch_id: 'watch_123', workspace_id: 'ws_123', channel_id: 'ch_123' },
      },
      calls,
    ),
    input: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      watch_id: 'watch_123',
      snooze_until: '2026-05-24T11:00:00.000Z',
      reason: 'Too noisy',
    },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.action_control.action_type, 'snooze');
  assert.equal(result.action_control.target_type, 'watch');
  assert.match(calls.find((call) => /INSERT OR IGNORE INTO watch_action_controls/.test(call.sql)).sql, /watch_action_controls/);
});

test('admin mute and resume signal writes durable controls', async () => {
  const calls = [];
  const db = scopedDb(
    {
      workspace: { id: 'ws_123', workspace_id: 'ws_123' },
      channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
      signal: { id: 'sig_123', signal_id: 'sig_123', workspace_id: 'ws_123', channel_id: 'ch_123' },
    },
    calls,
  );
  const mute = await muteAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:control'] },
    db,
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', signal_id: 'sig_123' },
    now: '2026-05-24T10:00:00.000Z',
  });
  const resume = await resumeAdminWatch({
    auth: { user_id: 'user_admin', permissions: ['watch:control'] },
    db,
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', signal_id: 'sig_123' },
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.equal(mute.ok, true);
  assert.equal(mute.action_control.action_type, 'mute');
  assert.equal(resume.ok, true);
  assert.equal(resume.action_control.action_type, 'resume');
  assert.equal(calls.some((call) => /UPDATE watch_action_controls/.test(call.sql)), true);
});

test('admin ignore alert marks pending deliveries ignored', async () => {
  const calls = [];
  const result = await ignoreAdminAlert({
    auth: { user_id: 'user_admin', permissions: ['watch:control'] },
    db: scopedDb(
      {
        workspace: { id: 'ws_123', workspace_id: 'ws_123' },
        channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
        alert: { id: 'alert_123', workspace_id: 'ws_123', channel_id: 'ch_123' },
      },
      calls,
    ),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', alert_id: 'alert_123' },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.action_control.action_type, 'ignore');
  assert.equal(calls.some((call) => /UPDATE alert_deliveries/.test(call.sql) && call.params[0] === 'ignored'), true);
});

test('admin create subscriber rejects lifecycle mode for non-webhook types', async () => {
  const result = await createAdminSubscriber({
    auth: { user_id: 'user_admin', permissions: ['subscriber:create'] },
    db: scopedDb({
      workspace: { id: 'ws_123', workspace_id: 'ws_123' },
      channel: { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123' },
    }),
    input: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      subscriber_type: 'email',
      destination_url: 'user@example.com',
      mode: 'lifecycle',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_SUBSCRIBER_MODE');
});
