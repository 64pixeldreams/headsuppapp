import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEmailActionLinks,
  buildEmailActionUrl,
  createEmailActionToken,
  normalizeEmailActionIds,
  processEmailActionToken,
  verifyEmailActionToken,
} from '../../src/services/subscribers/email-actions.js';

function fakeDb({ subscriber = null, watch = null, existingAction = null, calls = [] } = {}) {
  return {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (/FROM subscribers/.test(sql)) return subscriber;
              if (/FROM watches/.test(sql)) return watch;
              if (/FROM watch_action_controls/.test(sql)) return existingAction;
              return null;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const env = {
  HEADSUPP_EMAIL_ACTION_SECRET: 'email_action_secret',
  HEADSUPP_PUBLIC_BASE_URL: 'https://headsupp.io',
};

test('normalizes configured email action ids', () => {
  assert.deepEqual(
    normalizeEmailActionIds(['snooze_1h', 'bad_action', 'SNOOZE_1H', 'snooze_1d', 'stop_watching']),
    ['snooze_1h', 'snooze_1d', 'stop_watching'],
  );
  assert.deepEqual(normalizeEmailActionIds(null), []);
});

test('creates and verifies signed email action token', async () => {
  const token = await createEmailActionToken({
    env,
    subscriberId: 'sub_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
    watchId: 'watch_1',
    alertId: 'alert_1',
    deliveryId: 'delivery_1',
    actionId: 'snooze_1h',
    now: '2026-05-25T12:00:00.000Z',
    ttlSeconds: 3600,
  });

  const verified = await verifyEmailActionToken({
    env,
    token,
    now: '2026-05-25T12:30:00.000Z',
  });

  assert.equal(verified.ok, true);
  assert.equal(verified.payload.action, 'snooze_1h');
  assert.equal(verified.payload.dur, 3600);
  assert.match(buildEmailActionUrl({ token, env }), /\/v1\/subscribers\/email-action\?token=/);
});

test('rejects expired email action token without mutating state', async () => {
  const token = await createEmailActionToken({
    env,
    subscriberId: 'sub_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
    watchId: 'watch_1',
    actionId: 'snooze_1h',
    now: '2026-05-25T12:00:00.000Z',
    ttlSeconds: 60,
  });

  const db = fakeDb();
  const result = await processEmailActionToken({
    db,
    env,
    token,
    now: '2026-05-25T12:10:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'EXPIRED_TOKEN');
  assert.equal(db.calls.length, 0);
});

test('processes snooze action token idempotently', async () => {
  const token = await createEmailActionToken({
    env,
    subscriberId: 'sub_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
    watchId: 'watch_1',
    alertId: 'alert_1',
    actionId: 'snooze_1d',
    now: '2026-05-25T12:00:00.000Z',
  });
  const db = fakeDb({
    subscriber: { id: 'sub_1', subscriber_id: 'sub_1', workspace_id: 'ws_1', channel_id: 'ch_1' },
    watch: { id: 'watch_1', watch_id: 'watch_1', workspace_id: 'ws_1', channel_id: 'ch_1' },
  });

  const result = await processEmailActionToken({
    db,
    env,
    token,
    now: '2026-05-25T12:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SNOOZED');
  assert.equal(result.expires_at, '2026-05-26T12:00:00.000Z');
  assert.ok(db.calls.some((call) => /INSERT INTO watch_action_controls/.test(call.sql)));

  const replayDb = fakeDb({ existingAction: { id: result.action_control_id, action_id: result.action_control_id } });
  const replay = await processEmailActionToken({
    db: replayDb,
    env,
    token,
    now: '2026-05-25T12:01:00.000Z',
  });
  assert.equal(replay.code, 'ALREADY_APPLIED');
  assert.ok(!replayDb.calls.some((call) => /INSERT INTO watch_action_controls/.test(call.sql)));
});

test('requires confirmation before stop watching mutates subscriber', async () => {
  const token = await createEmailActionToken({
    env,
    subscriberId: 'sub_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
    watchId: 'watch_1',
    actionId: 'stop_watching',
    now: '2026-05-25T12:00:00.000Z',
  });
  const db = fakeDb({
    subscriber: { id: 'sub_1', subscriber_id: 'sub_1', workspace_id: 'ws_1', channel_id: 'ch_1', enabled: 1 },
  });

  const first = await processEmailActionToken({ db, env, token, now: '2026-05-25T12:00:00.000Z' });
  assert.equal(first.needs_confirmation, true);
  assert.ok(!db.calls.some((call) => /UPDATE subscribers SET enabled = 0/.test(call.sql)));

  const confirmed = await processEmailActionToken({
    db,
    env,
    token,
    confirm: true,
    now: '2026-05-25T12:01:00.000Z',
  });
  assert.equal(confirmed.code, 'STOPPED');
  assert.ok(db.calls.some((call) => /UPDATE subscribers SET enabled = 0/.test(call.sql)));
});

test('builds links only for configured known actions', async () => {
  const links = await buildEmailActionLinks({
    env,
    subscriber: {
      id: 'sub_1',
      subscriber_id: 'sub_1',
      config_json: JSON.stringify({ actions: ['snooze_1h', 'unknown', 'stop_watching'] }),
    },
    alert: {
      id: 'alert_1',
      workspace_id: 'ws_1',
      channel_id: 'ch_1',
      watch_id: 'watch_1',
    },
    delivery: { id: 'delivery_1' },
    now: '2026-05-25T12:00:00.000Z',
  });

  assert.deepEqual(
    links.map((link) => link.id),
    ['snooze_1h', 'stop_watching'],
  );
  assert.match(links[0].url, /\/v1\/subscribers\/email-action\?token=/);
});
