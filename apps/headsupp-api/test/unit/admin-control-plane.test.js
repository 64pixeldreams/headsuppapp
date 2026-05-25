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
  createAdminSignal,
  createAdminSubscriber,
  createAdminWatch,
  createAdminWorkspace,
  getAdminChannel,
  getAdminChannelContract,
  ignoreAdminAlert,
  muteAdminWatch,
  resumeAdminWatch,
  snoozeAdminWatch,
  updateAdminChannel,
  updateAdminChannelContract,
} from '../../src/services/admin/control-plane.js';

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
              if (/FROM signals/.test(sql)) return rows.signal || null;
              if (/FROM watches/.test(sql)) return rows.watch || null;
              if (/FROM alerts/.test(sql)) return rows.alert || null;
              if (/FROM channel_contracts/.test(sql)) return rows.channelContract || null;
              return null;
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
    input: { name: 'Foretic Demo', source_app: 'foretic', external_tenant_id: 'user:123' },
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.workspace.source_app, 'foretic');
  assert.match(calls[0].sql, /INSERT OR IGNORE INTO workspaces/);
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
    db: dbRecorder(calls),
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
  assert.equal(calls.filter((call) => /INSERT OR IGNORE INTO watches/.test(call.sql)).length, 1);
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
