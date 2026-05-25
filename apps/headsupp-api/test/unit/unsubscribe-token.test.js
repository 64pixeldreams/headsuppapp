import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  processUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../../src/services/subscribers/unsubscribe.js';

function fakeDb(subscriber = null, calls = []) {
  return {
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

test('creates and verifies signed unsubscribe token', async () => {
  const env = { HEADSUPP_UNSUBSCRIBE_SECRET: 'secret_123' };
  const token = await createUnsubscribeToken({
    env,
    subscriberId: 'sub_1',
    channelId: 'ch_1',
    mode: 'alert',
    now: '2026-05-25T12:00:00.000Z',
    ttlSeconds: 3600,
  });

  assert.ok(token);
  const verified = await verifyUnsubscribeToken({
    env,
    token,
    now: '2026-05-25T12:30:00.000Z',
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.payload.sub, 'sub_1');
});

test('rejects expired unsubscribe token', async () => {
  const env = { HEADSUPP_UNSUBSCRIBE_SECRET: 'secret_123' };
  const token = await createUnsubscribeToken({
    env,
    subscriberId: 'sub_1',
    now: '2026-05-25T12:00:00.000Z',
    ttlSeconds: 60,
  });

  const verified = await verifyUnsubscribeToken({
    env,
    token,
    now: '2026-05-25T13:10:00.000Z',
  });
  assert.equal(verified.ok, false);
  assert.equal(verified.code, 'EXPIRED_TOKEN');
});

test('processes unsubscribe token and disables subscriber', async () => {
  const env = {
    HEADSUPP_UNSUBSCRIBE_SECRET: 'secret_123',
    HEADSUPP_PUBLIC_BASE_URL: 'https://headsupp.io',
  };
  const token = await createUnsubscribeToken({
    env,
    subscriberId: 'sub_1',
    channelId: 'ch_1',
    mode: 'alert',
  });
  const calls = [];
  const result = await processUnsubscribeToken({
    db: fakeDb(
      {
        id: 'sub_1',
        subscriber_id: 'sub_1',
        workspace_id: 'ws_1',
        channel_id: 'ch_1',
        mode: 'alert',
        enabled: 1,
      },
      calls,
    ),
    env,
    token,
    now: '2026-05-25T12:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.ok(calls.some((call) => /UPDATE subscribers SET enabled = 0/.test(call.sql)));
  assert.match(buildUnsubscribeUrl({ token, env }), /v1\/subscribers\/unsubscribe\?token=/);
});
