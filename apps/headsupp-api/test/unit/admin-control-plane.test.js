import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConnectorRow,
  buildSubscriberRow,
  buildWatchRow,
  createAdminConnector,
  createAdminSignal,
  createAdminSubscriber,
  createAdminWatch,
  createAdminWorkspace,
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
