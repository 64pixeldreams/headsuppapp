import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuietSummaryPayload,
  evaluateQuietSummaryChannel,
  evaluateQuietSummaries,
} from '../../src/services/scheduled-watches/quiet-summary.js';
import { quietSummarySlackPayload, quietSummaryWebhookPayload } from '../../src/services/delivery/quiet-summary.js';

function quietDb({ latest = null } = {}, batches = [], runs = []) {
  return {
    prepare(sql) {
      const all = async () => {
        if (sql.includes('SELECT DISTINCT')) return { results: [{ workspace_id: 'ws_123', channel_id: 'ch_123' }] };
        return { results: [] };
      };
      return {
        all,
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM quiet_summary_deliveries')) return latest;
              if (sql.includes('FROM channels')) {
                return { id: 'ch_123', channel_id: 'ch_123', workspace_id: 'ws_123', name: 'Forecasts' };
              }
              return null;
            },
            async all() {
              if (sql.includes('SELECT DISTINCT')) return { results: [{ workspace_id: 'ws_123', channel_id: 'ch_123' }] };
              if (sql.includes('FROM subscribers')) {
                return {
                  results: [
                    {
                      id: 'sub_123',
                      subscriber_id: 'sub_123',
                      workspace_id: 'ws_123',
                      channel_id: 'ch_123',
                      subscriber_type: 'webhook',
                      destination_url: 'https://example.com/quiet',
                      mode: 'quiet_summary',
                      config_json: '{"schedule":"hourly"}',
                    },
                  ],
                };
              }
              if (sql.includes('FROM watches')) {
                return {
                  results: [
                    {
                      id: 'watch_123',
                      watch_id: 'watch_123',
                      name: 'Pace watch',
                      watch_type: 'LAST_VALUE_LT',
                    },
                  ],
                };
              }
              if (sql.includes('FROM watch_states')) {
                return {
                  results: [
                    {
                      watch_id: 'watch_123',
                      last_status: 'quiet',
                      last_evaluated_at: '2026-05-24T09:45:00.000Z',
                      last_alert_at: null,
                      cooldown_until: null,
                      updated_at: '2026-05-24T09:45:00.000Z',
                    },
                  ],
                };
              }
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

test('builds quiet summary payload with last-evaluated metadata', () => {
  const payload = buildQuietSummaryPayload({
    channel: { workspace_id: 'ws_123', channel_id: 'ch_123', name: 'Forecasts' },
    watches: [{ id: 'watch_123', name: 'Pace watch', watch_type: 'LAST_VALUE_LT' }],
    statesByWatchId: new Map([
      [
        'watch_123',
        {
          last_status: 'quiet',
          last_evaluated_at: '2026-05-24T09:45:00.000Z',
          updated_at: '2026-05-24T09:45:00.000Z',
        },
      ],
    ]),
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(payload.type, 'heads_up.quiet_summary');
  assert.equal(payload.status, 'quiet');
  assert.equal(payload.watches[0].last_evaluated_at, '2026-05-24T09:45:00.000Z');
});

test('quiet summary channel emits delivery without creating alerts', async () => {
  const batches = [];
  const runs = [];
  const fetchCalls = [];
  const result = await evaluateQuietSummaryChannel({
    db: quietDb({}, batches, runs),
    workspaceId: 'ws_123',
    channelId: 'ch_123',
    now: '2026-05-24T10:00:00.000Z',
    fetchFn: async (url, init) => {
      fetchCalls.push({ url, init });
      return { status: 200, async text() { return 'ok'; } };
    },
  });

  assert.equal(result.emitted, true);
  assert.equal(result.deliveries, 1);
  assert.equal(batches.length, 1);
  assert.equal(fetchCalls.length, 1);
  assert.equal(runs.some((run) => /UPDATE quiet_summary_deliveries/.test(run.sql)), true);
});

test('quiet summary cadence skips when latest delivery is fresh', async () => {
  const result = await evaluateQuietSummaryChannel({
    db: quietDb({ latest: { created_at: '2026-05-24T09:30:00.000Z' } }),
    workspaceId: 'ws_123',
    channelId: 'ch_123',
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.emitted, false);
  assert.equal(result.reason, 'QUIET_SUMMARY_NOT_DUE');
});

test('quiet summary scheduler returns channel and delivery counts', async () => {
  const result = await evaluateQuietSummaries({
    db: quietDb(),
    now: '2026-05-24T10:00:00.000Z',
    dispatch: false,
  });

  assert.equal(result.channels, 1);
  assert.equal(result.emitted, 1);
  assert.equal(result.deliveries, 1);
});

test('quiet summary payloads support webhook and Slack subscribers', () => {
  const delivery = {
    payload_json: JSON.stringify({
      type: 'heads_up.quiet_summary',
      channel_id: 'ch_123',
      channel_name: 'Forecasts',
      generated_at: '2026-05-24T10:00:00.000Z',
      watches: [{ watch_id: 'watch_123' }],
    }),
  };

  assert.equal(quietSummaryWebhookPayload(delivery).type, 'heads_up.quiet_summary');
  assert.match(quietSummarySlackPayload(delivery).text, /Forecasts has 1 watched item quiet/);
});
