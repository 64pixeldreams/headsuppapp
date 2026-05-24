import assert from 'node:assert/strict';
import test from 'node:test';

import { processRawEventMessages } from '../../src/services/aggregation/consumer.js';

function createConsumerDb({ duplicate = false } = {}) {
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (sql.includes('FROM signals')) {
                return { id: 'sig_123', signal_key: 'forecast.revenue.pace' };
              }
              if (sql.includes('FROM signal_contracts')) {
                return {
                  id: 'contract_123',
                  signal_id: 'sig_123',
                  contract_json: JSON.stringify({
                    dimensions: ['forecast_id', 'status'],
                    default_bucket_types: ['hour'],
                    default_aggregate: 'last',
                  }),
                };
              }
              return null;
            },
            async all() {
              if (sql.includes('FROM watches')) {
                return { results: [{ watch_id: 'watch_warning', signal_id: 'sig_123' }] };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes('raw_event_dedupe')) {
                return { meta: { changes: duplicate ? 0 : 1 } };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}

const message = {
  workspaceId: 'ws_123',
  channelId: 'ch_123',
  connectorId: 'conn_123',
  connectorKey: 'ck_123',
  receivedAt: '2026-05-24T10:00:00.000Z',
  event: {
    idempotency_key: 'evt_123',
    signal_key: 'forecast.revenue.pace',
    occurred_at: '2026-05-24T10:37:00.000Z',
    value: { num: 64 },
    fields: {
      forecast_id: 'fc_123',
      status: 'critical',
    },
  },
};

test('processes raw events through idempotency, aggregate upsert, and watch invocation', async () => {
  const fetches = [];
  const env = {
    DB: createConsumerDb(),
    WATCH_EVALUATOR: {
      idFromName(name) {
        return `id:${name}`;
      },
      get() {
        return {
          async fetch(_url, init) {
            fetches.push(JSON.parse(init.body));
            return new Response('{}', { status: 202 });
          },
        };
      },
    },
  };

  const result = await processRawEventMessages([message], env, '2026-05-24T10:38:00.000Z');

  assert.equal(result.processed, 1);
  assert.equal(result.duplicates, 0);
  assert.equal(result.aggregate_deltas, 1);
  assert.equal(result.watch_invocations, 1);
  assert.equal(fetches[0].reason, 'aggregate_updated');
});

test('skips aggregate and watch work for duplicate raw events', async () => {
  const env = {
    DB: createConsumerDb({ duplicate: true }),
    WATCH_EVALUATOR: {
      idFromName(name) {
        return `id:${name}`;
      },
      get() {
        throw new Error('watch evaluator should not be invoked for duplicate events');
      },
    },
  };

  const result = await processRawEventMessages([message], env, '2026-05-24T10:38:00.000Z');

  assert.equal(result.processed, 0);
  assert.equal(result.duplicates, 1);
  assert.equal(result.aggregate_deltas, 0);
  assert.equal(result.watch_invocations, 0);
});
