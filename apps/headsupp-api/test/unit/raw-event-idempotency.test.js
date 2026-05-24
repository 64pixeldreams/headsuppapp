import assert from 'node:assert/strict';
import test from 'node:test';

import { beginRawEventProcessing, markRawEventProcessed, rawEventIdempotencyKey } from '../../src/services/aggregation/idempotency.js';

function fakeDb(changes = 1, calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (sql.includes('SELECT processed_at')) {
                return changes === 0 ? { processed_at: '2026-05-24T10:00:01.000Z', status: 'processed' } : { processed_at: null, status: 'processing' };
              }
              return null;
            },
            async run() {
              return { meta: { changes } };
            },
          };
        },
      };
    },
  };
}

const message = {
  workspaceId: 'ws_123',
  channelId: 'ch_123',
  connectorId: 'conn_123',
  receivedAt: '2026-05-24T10:00:00.000Z',
  event: {
    idempotency_key: 'evt_123',
    signal_key: 'oxygen.percent',
    occurred_at: '2026-05-24T10:00:00.000Z',
    value: { num: 10 },
  },
};

test('uses producer supplied raw event idempotency key', async () => {
  assert.equal(await rawEventIdempotencyKey(message), 'evt_123');
});

test('generates deterministic idempotency key when missing', async () => {
  const withoutKey = {
    ...message,
    event: { ...message.event, idempotency_key: null },
  };

  const first = await rawEventIdempotencyKey(withoutKey);
  const second = await rawEventIdempotencyKey(withoutKey);

  assert.equal(first, second);
  assert.match(first, /^conn_123:oxygen\.percent:2026-05-24T10:00:00\.000Z:[a-f0-9]{64}$/);
});

test('begins raw event processing with idempotency insert', async () => {
  const calls = [];
  const result = await beginRawEventProcessing(fakeDb(1, calls), message);

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(calls[0].params[0], 'evt_123');
  assert.equal(calls[0].params[1], 'ws_123');
});

test('marks duplicate when D1 insert is ignored', async () => {
  const result = await beginRawEventProcessing(fakeDb(0), message);

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
});

test('marks processing key as processed', async () => {
  const calls = [];
  const result = await markRawEventProcessed(fakeDb(1, calls), 'evt_123', '2026-05-24T10:00:05.000Z');
  assert.equal(result.ok, true);
  assert.equal(calls[calls.length - 1].params[2], 'evt_123');
});
