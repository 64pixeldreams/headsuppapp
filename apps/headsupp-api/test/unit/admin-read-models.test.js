import assert from 'node:assert/strict';
import test from 'node:test';

import { getAdminWatchState, listAdminAlertTimeline, listAdminChannelAlerts } from '../../src/services/admin/read-models.js';

function readDb(rows = {}, calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (/FROM workspaces/.test(sql)) return rows.workspace || null;
              if (/FROM channels/.test(sql)) return rows.channel || null;
              if (/COUNT\(\*\)/.test(sql)) return { count: rows.suppressedCount || 0 };
              if (/FROM watches/.test(sql)) return rows.watch || null;
              if (/FROM watch_states/.test(sql)) return rows.watchState || null;
              return null;
            },
            async all() {
              if (/FROM alerts/.test(sql)) return { results: rows.alerts || [] };
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

const scopedRows = {
  workspace: { id: 'ws_123', workspace_id: 'ws_123', source_app: 'demo', external_tenant_id: 'tenant_1' },
  channel: {
    id: 'ch_123',
    channel_id: 'ch_123',
    workspace_id: 'ws_123',
    source_app: 'demo',
    external_tenant_id: 'tenant_1',
  },
};

test('channel alert reads return safe alert payloads and suppressed metadata', async () => {
  const result = await listAdminChannelAlerts({
    auth: { user_id: 'user_admin', permissions: ['alert:read'], source_app: 'demo', external_tenant_id: 'tenant_1' },
    db: readDb({
      ...scopedRows,
      suppressedCount: 2,
      alerts: [
        {
          id: 'alert_1',
          workspace_id: 'ws_123',
          channel_id: 'ch_123',
          signal_id: 'sig_123',
          watch_id: 'watch_123',
          triggered_at: '2026-05-24T10:00:00.000Z',
          severity: 'warning',
          current_value: 15,
          threshold_value: 10,
          summary_text: 'Demo alert',
          payload_json: '{"fields":{"forecast_id":"fc_1"},"destination_url":"https://secret.example"}',
          cta_label: 'View',
          cta_url: 'https://example.com',
          created_at: '2026-05-24T10:00:00.000Z',
        },
      ],
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123' },
    now: '2026-05-24T11:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.metadata.suppressed_watch_count, 2);
  assert.deepEqual(result.alerts[0].fields, { forecast_id: 'fc_1' });
  assert.equal(Object.hasOwn(result.alerts[0], 'payload_json'), false);
});

test('watch state reads enforce tenant scope', async () => {
  const result = await getAdminWatchState({
    auth: { user_id: 'user_admin', permissions: ['watch:read'], source_app: 'demo', external_tenant_id: 'tenant_2' },
    db: readDb(scopedRows),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', watch_id: 'watch_123' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TENANT_SCOPE_MISMATCH');
});

test('watch state reads include trust timestamps without destinations', async () => {
  const result = await getAdminWatchState({
    auth: { user_id: 'user_admin', permissions: ['watch:read'], source_app: 'demo', external_tenant_id: 'tenant_1' },
    db: readDb({
      ...scopedRows,
      watch: { id: 'watch_123', watch_id: 'watch_123', workspace_id: 'ws_123', channel_id: 'ch_123' },
      watchState: {
        watch_id: 'watch_123',
        last_status: 'quiet',
        last_evaluated_at: '2026-05-24T10:00:00.000Z',
        last_alert_at: null,
        cooldown_until: null,
        updated_at: '2026-05-24T10:01:00.000Z',
      },
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', watch_id: 'watch_123' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.watch_state.last_status, 'quiet');
  assert.equal(result.watch_state.last_evaluated_at, '2026-05-24T10:00:00.000Z');
});

test('alert timeline requires alert read permission', async () => {
  const result = await listAdminAlertTimeline({
    auth: { user_id: 'user_admin', permissions: [] },
    db: readDb(scopedRows),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERMISSION_DENIED');
});
