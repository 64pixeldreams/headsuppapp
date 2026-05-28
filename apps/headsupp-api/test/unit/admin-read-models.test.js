import assert from 'node:assert/strict';
import test from 'node:test';

import { getAdminWatchState, listAdminAlertTimeline, listAdminChannelAlerts, traceAdminEvent } from '../../src/services/admin/read-models.js';

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

function traceDb(rows = {}, calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (/FROM workspaces/.test(sql)) return rows.workspace || null;
              if (/FROM channels/.test(sql)) return rows.channel || null;
              if (/FROM raw_event_dedupe/.test(sql)) return rows.rawEvent || null;
              if (/FROM signals/.test(sql)) return rows.signal || null;
              if (/FROM watches/.test(sql)) return rows.watch || null;
              if (/FROM watch_groups/.test(sql)) return rows.watchGroup || null;
              return null;
            },
            async all() {
              if (/FROM aggregates/.test(sql)) return { results: rows.aggregates || [] };
              if (/FROM watches w/.test(sql)) return { results: rows.watchStates || [] };
              if (/FROM alerts/.test(sql)) return { results: rows.alerts || [] };
              if (/FROM alert_deliveries/.test(sql)) return { results: rows.deliveries || [] };
              if (/FROM subscribers/.test(sql)) return { results: rows.subscribers || [] };
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

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

test('trace event returns safe processing, alert, delivery, and routing details', async () => {
  const result = await traceAdminEvent({
    auth: { user_id: 'user_admin', permissions: ['alert:read'], source_app: 'demo', external_tenant_id: 'tenant_1' },
    db: traceDb({
      ...scopedRows,
      rawEvent: {
        idempotency_key: 'evt_123',
        workspace_id: 'ws_123',
        channel_id: 'ch_123',
        signal_key: 'forecast.pace',
        received_at: '2026-05-24T10:00:00.000Z',
        status: 'processed',
        processing_started_at: '2026-05-24T10:00:01.000Z',
        aggregate_applied_at: '2026-05-24T10:00:02.000Z',
        processed_at: '2026-05-24T10:00:03.000Z',
        updated_at: '2026-05-24T10:00:03.000Z',
      },
      signal: { id: 'sig_123', signal_id: 'sig_123', signal_key: 'forecast.pace' },
      watch: { id: 'watch_123', watch_id: 'watch_123', watch_group_id: 'wg_123', band_key: 'critical' },
      watchGroup: { id: 'wg_123', watch_group_id: 'wg_123', group_key: 'pace_health' },
      aggregates: [{ id: 'agg_1', signal_id: 'sig_123', signal_key: 'forecast.pace', updated_at: '2026-05-24T10:00:02.000Z' }],
      watchStates: [
        {
          id: 'watch_123',
          watch_id: 'watch_123',
          name: 'Pace critical',
          watch_type: 'LAST_VALUE_LT',
          band_key: 'critical',
          last_status: 'triggered',
          updated_at: '2026-05-24T10:00:03.000Z',
        },
      ],
      alerts: [
        {
          id: 'alert_123',
          workspace_id: 'ws_123',
          channel_id: 'ch_123',
          signal_id: 'sig_123',
          watch_id: 'watch_123',
          triggered_at: '2026-05-24T10:00:03.000Z',
          severity: 'critical',
          current_value: 60,
          threshold_value: 70,
          summary_text: 'Pace critical',
          payload_json: '{"fields":{"forecast_id":"fc_1"},"band_key":"critical"}',
          created_at: '2026-05-24T10:00:03.000Z',
        },
      ],
      deliveries: [
        {
          id: 'delivery_123',
          alert_id: 'alert_123',
          subscriber_id: 'sub_123',
          destination_url: 'martin@example.com',
          status: 'sent',
          attempt_count: 1,
          response_code: 202,
          response_body: 'ok',
          created_at: '2026-05-24T10:00:03.000Z',
          updated_at: '2026-05-24T10:00:04.000Z',
        },
      ],
      subscribers: [
        {
          id: 'sub_123',
          subscriber_id: 'sub_123',
          subscriber_type: 'email',
          mode: 'alert',
          subscriber_scope: 'channel',
          config_json: '{"filters":{"band_keys":["critical"]}}',
        },
      ],
    }),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', idempotency_key: 'evt_123' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.trace.summary.accepted, true);
  assert.equal(result.trace.summary.latest_delivery_status, 'sent');
  assert.equal(result.trace.deliveries[0].destination_url, undefined);
  assert.equal(result.trace.deliveries[0].response_body_summary, 'ok');
  assert.equal(result.trace.subscriber_routing[0].subscribers[0].matched, true);
});

test('trace event reports missing raw event without leaking scope data', async () => {
  const result = await traceAdminEvent({
    auth: { user_id: 'user_admin', permissions: ['alert:read'], source_app: 'demo', external_tenant_id: 'tenant_1' },
    db: traceDb(scopedRows),
    input: { workspace_id: 'ws_123', channel_id: 'ch_123', idempotency_key: 'evt_missing' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.trace.found, false);
  assert.equal(result.trace.summary.suppression_reason, 'RAW_EVENT_NOT_FOUND');
});
