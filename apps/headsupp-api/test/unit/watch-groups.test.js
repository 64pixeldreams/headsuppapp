import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateWatchGroupRequest,
  selectWatchGroupWinner,
} from '../../src/services/watches/watch-groups.js';

const group = {
  id: 'wg_123',
  watch_group_id: 'wg_123',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_123',
  group_key: 'forecast_pace_health',
  winner_policy: 'highest_severity_wins',
  cooldown_seconds: 3600,
  recovery_json: JSON.stringify({ condition: 'value >= 95', severity: 'recovery' }),
};

const warningWatch = {
  id: 'watch_warning',
  watch_id: 'watch_warning',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_123',
  watch_group_id: 'wg_123',
  band_key: 'warning',
  name: 'Forecast pace warning',
  watch_type: 'LAST_VALUE_LT',
  config_json: JSON.stringify({ threshold: 85, severity: 'warning', bucket_type: 'minute' }),
  cooldown_seconds: 3600,
  enabled: 1,
};

const criticalWatch = {
  ...warningWatch,
  id: 'watch_critical',
  watch_id: 'watch_critical',
  band_key: 'critical',
  name: 'Forecast pace critical',
  config_json: JSON.stringify({ threshold: 70, severity: 'critical', bucket_type: 'minute' }),
};

function createGroupDb({ state = null, watches = [warningWatch, criticalWatch] } = {}) {
  const batchItems = [];
  const runs = [];
  const db = {
    batchItems,
    runs,
    prepare(sql) {
      return {
        bind(...params) {
          const statement = { sql, params };
          return {
            ...statement,
            async first() {
              if (/FROM watch_group_states/.test(sql)) return state;
              return null;
            },
            async all() {
              if (/FROM watches/.test(sql)) return { results: watches };
              if (/FROM subscribers/.test(sql)) {
                return {
                  results: [{ id: 'sub_123', subscriber_id: 'sub_123', destination_url: 'https://example.com/webhook' }],
                };
              }
              return { results: [] };
            },
            async run() {
              runs.push(statement);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(items) {
      batchItems.push(...items);
    },
  };
  return db;
}

function input(now = '2026-05-24T10:05:00.000Z') {
  return {
    watchId: 'watch_warning',
    signalId: 'sig_123',
    bucketType: 'minute',
    bucketStartAt: '2026-05-24T10:00:00.000Z',
    now,
  };
}

test('highest_severity_wins chooses critical over warning', () => {
  const winner = selectWatchGroupWinner(
    [
      { watch: warningWatch, evaluation: { severity: 'warning', threshold: 85 } },
      { watch: criticalWatch, evaluation: { severity: 'critical', threshold: 70 } },
    ],
    group,
  );

  assert.equal(winner.watch.band_key, 'critical');
});

test('lowest_severity_wins chooses warning over critical', () => {
  const winner = selectWatchGroupWinner(
    [
      { watch: warningWatch, evaluation: { severity: 'warning', threshold: 85 } },
      { watch: criticalWatch, evaluation: { severity: 'critical', threshold: 70 } },
    ],
    { ...group, winner_policy: 'lowest_severity_wins' },
  );

  assert.equal(winner.watch.band_key, 'warning');
});

test('grouped pace value 78 sends warning only', async () => {
  const db = createGroupDb();

  const result = await evaluateWatchGroupRequest({
    db,
    group,
    input: input(),
    loadAggregatesForWatch: async () => [{ last_value: 78 }],
  });

  assert.equal(result.action, 'alert');
  assert.equal(result.winner, 'warning');
  assert.equal(result.deliveries, 1);
  assert.equal(db.batchItems.length, 3);
  const alertInsert = db.batchItems[0];
  assert.match(alertInsert.params[9], /"band_key":"warning"/);
  assert.match(alertInsert.params[9], /"watch_group_id":"wg_123"/);
});

test('grouped pace value 64 sends critical only', async () => {
  const db = createGroupDb();

  const result = await evaluateWatchGroupRequest({
    db,
    group,
    input: input(),
    loadAggregatesForWatch: async () => [{ last_value: 64 }],
  });

  assert.equal(result.action, 'alert');
  assert.equal(result.winner, 'critical');
  assert.equal(result.suppressed, 1);
  const alertInsert = db.batchItems[0];
  assert.equal(alertInsert.params[5], 'critical');
  assert.match(alertInsert.params[9], /"band_key":"critical"/);
});

test('group cooldown suppresses same or lower severity repeat', async () => {
  const db = createGroupDb({
    state: {
      watch_group_id: 'wg_123',
      last_status: 'triggered',
      last_alert_severity: 'critical',
      cooldown_until: '2026-05-24T11:00:00.000Z',
    },
  });

  const result = await evaluateWatchGroupRequest({
    db,
    group,
    input: input(),
    loadAggregatesForWatch: async () => [{ last_value: 64 }],
  });

  assert.equal(result.action, 'none');
  assert.equal(result.reason, 'GROUP_COOLDOWN_ACTIVE');
  assert.equal(db.batchItems.length, 0);
});

test('group recovery emits once when previously triggered', async () => {
  const db = createGroupDb({
    state: {
      watch_group_id: 'wg_123',
      last_status: 'triggered',
      last_alert_severity: 'critical',
      cooldown_until: '2026-05-24T11:00:00.000Z',
    },
  });

  const result = await evaluateWatchGroupRequest({
    db,
    group,
    input: input(),
    loadAggregatesForWatch: async () => [{ last_value: 96 }],
  });

  assert.equal(result.action, 'recovery');
  assert.equal(result.deliveries, 1);
  const alertInsert = db.batchItems[0];
  assert.equal(alertInsert.params[5], 'recovery');
});
