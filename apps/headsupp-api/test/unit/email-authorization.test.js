import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEmailAuthorizationUrl,
  createEmailAuthorizationToken,
  normalizeAuthorizationConfig,
  processEmailAuthorizationToken,
  sendAuthorizationEmail,
  verifyEmailAuthorizationToken,
} from '../../src/services/subscribers/email-authorization.js';

function fakeDb({ subscriber = null, calls = [] } = {}) {
  return {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (/FROM subscribers/.test(sql)) return subscriber;
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
  HEADSUPP_EMAIL_AUTH_SECRET: 'email_auth_secret',
  HEADSUPP_PUBLIC_BASE_URL: 'https://headsupp.io',
};

test('normalizes optional authorization config only when required', () => {
  const disabled = normalizeAuthorizationConfig({}, '2026-05-26T00:00:00.000Z');
  const enabled = normalizeAuthorizationConfig(
    { authorization: { required: true } },
    '2026-05-26T00:00:00.000Z',
  );

  assert.equal(disabled.required, false);
  assert.equal(enabled.required, true);
  assert.equal(enabled.config.authorization.status, 'pending');
  assert.equal(enabled.config.authorization.requested_at, '2026-05-26T00:00:00.000Z');
});

test('creates and verifies signed email authorization token', async () => {
  const token = await createEmailAuthorizationToken({
    env,
    subscriberId: 'sub_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
    now: '2026-05-26T00:00:00.000Z',
    ttlSeconds: 3600,
  });
  const verified = await verifyEmailAuthorizationToken({
    env,
    token,
    now: '2026-05-26T00:30:00.000Z',
  });

  assert.equal(verified.ok, true);
  assert.equal(verified.payload.sub, 'sub_1');
  assert.match(buildEmailAuthorizationUrl({ token, env }), /\/v1\/subscribers\/confirm\?token=/);
});

test('expired authorization token does not mutate state', async () => {
  const token = await createEmailAuthorizationToken({
    env,
    subscriberId: 'sub_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
    now: '2026-05-26T00:00:00.000Z',
    ttlSeconds: 60,
  });
  const db = fakeDb();
  const result = await processEmailAuthorizationToken({
    db,
    env,
    token,
    now: '2026-05-26T00:10:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'EXPIRED_TOKEN');
  assert.equal(db.calls.length, 0);
});

test('processes authorization token and enables pending subscriber', async () => {
  const token = await createEmailAuthorizationToken({
    env,
    subscriberId: 'sub_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
    now: '2026-05-26T00:00:00.000Z',
  });
  const db = fakeDb({
    subscriber: {
      id: 'sub_1',
      subscriber_id: 'sub_1',
      workspace_id: 'ws_1',
      channel_id: 'ch_1',
      enabled: 0,
      config_json: JSON.stringify({ authorization: { required: true, status: 'pending' } }),
    },
  });
  const result = await processEmailAuthorizationToken({
    db,
    env,
    token,
    now: '2026-05-26T00:05:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'CONFIRMED');
  assert.ok(db.calls.some((call) => /UPDATE subscribers SET enabled = 1/.test(call.sql)));
  const update = db.calls.find((call) => /UPDATE subscribers SET enabled = 1/.test(call.sql));
  assert.equal(JSON.parse(update.params[0]).authorization.status, 'authorized');
});

test('authorization confirmation is idempotent after subscriber is enabled', async () => {
  const token = await createEmailAuthorizationToken({
    env,
    subscriberId: 'sub_1',
    workspaceId: 'ws_1',
    channelId: 'ch_1',
  });
  const db = fakeDb({
    subscriber: {
      id: 'sub_1',
      subscriber_id: 'sub_1',
      workspace_id: 'ws_1',
      channel_id: 'ch_1',
      enabled: 1,
      config_json: JSON.stringify({ authorization: { required: true, status: 'authorized' } }),
    },
  });

  const result = await processEmailAuthorizationToken({ db, env, token });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'ALREADY_CONFIRMED');
  assert.ok(!db.calls.some((call) => /UPDATE subscribers SET enabled = 1/.test(call.sql)));
});

test('sendAuthorizationEmail sends only pending authorization subscribers', async () => {
  let sentMessage = null;
  const result = await sendAuthorizationEmail({
    env,
    subscriber: {
      id: 'sub_1',
      subscriber_id: 'sub_1',
      subscriber_type: 'email',
      workspace_id: 'ws_1',
      channel_id: 'ch_1',
      destination_url: 'martin@example.com',
      config_json: JSON.stringify({ authorization: { required: true, status: 'pending' } }),
    },
    now: '2026-05-26T00:00:00.000Z',
    sendEmailFn: async ({ message }) => {
      sentMessage = message;
    },
  });

  assert.equal(result.ok, true);
  assert.match(sentMessage.subject, /confirm your alert subscription/);
  assert.match(sentMessage.text, /\/v1\/subscribers\/confirm\?token=/);
});
