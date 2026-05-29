import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginRawEventProcessing,
  markRawEventAggregated,
  markRawEventProcessed,
  rawEventIdempotencyKey,
} from '../../src/services/aggregation/idempotency.js';

function fakeDb(changes = 1, calls = [], state = null) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (sql.includes('SELECT processed_at')) {
                return (
                  state ||
                  (changes === 0
                    ? { processed_at: '2026-05-24T10:00:01.000Z', aggregate_applied_at: '2026-05-24T10:00:01.000Z', status: 'processed' }
                    : { processed_at: null, aggregate_applied_at: null, status: 'processing' })
                );
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
  assert.equal(result.inserted, false);
});

test('detects aggregate-applied event that still needs completion', async () => {
  const result = await beginRawEventProcessing(
    fakeDb(0, [], { processed_at: null, aggregate_applied_at: '2026-05-24T10:00:03.000Z', status: 'processing' }),
    message,
  );

  assert.equal(result.duplicate, false);
  assert.equal(result.aggregate_applied, true);
});

test('treats a recent non-insert in-flight event as duplicate to avoid double apply', async () => {
  const result = await beginRawEventProcessing(
    fakeDb(0, [], {
      processed_at: null,
      aggregate_applied_at: null,
      status: 'processing',
      // started at the same instant as receivedAt -> not stale.
      processing_started_at: message.receivedAt,
    }),
    message,
  );

  assert.equal(result.duplicate, true);
  assert.equal(result.aggregate_applied, false);
});

test('reclaims a stale in-flight event so a failed attempt does not strand it', async () => {
  const result = await beginRawEventProcessing(
    fakeDb(0, [], {
      processed_at: null,
      aggregate_applied_at: null,
      status: 'processing',
      // started an hour before receivedAt -> stale, must be reprocessed.
      processing_started_at: '2026-05-24T09:00:00.000Z',
    }),
    message,
  );

  assert.equal(result.duplicate, false);
  assert.equal(result.aggregate_applied, false);
});

test('reclaims an in-flight event with no processing_started_at timestamp', async () => {
  const result = await beginRawEventProcessing(
    fakeDb(0, [], { processed_at: null, aggregate_applied_at: null, status: 'processing' }),
    message,
  );

  assert.equal(result.duplicate, false);
});

test('marks processing key as aggregated', async () => {
  const calls = [];
  const result = await markRawEventAggregated(fakeDb(1, calls), 'evt_123', '2026-05-24T10:00:04.000Z');
  assert.equal(result.ok, true);
  assert.equal(calls[calls.length - 1].params[2], 'evt_123');
});

test('marks processing key as processed', async () => {
  const calls = [];
  const result = await markRawEventProcessed(fakeDb(1, calls), 'evt_123', '2026-05-24T10:00:05.000Z');
  assert.equal(result.ok, true);
  assert.equal(calls[calls.length - 1].params[3], 'evt_123');
});
