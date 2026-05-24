import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SIGNAL_CONTRACT, resolveSignalAndContract } from '../../src/services/aggregation/signal-resolution.js';

function fakeDb({ signal = null, contract = null } = {}) {
  const inserts = [];
  return {
    inserts,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM signals')) return signal;
              if (sql.includes('FROM signal_contracts')) return contract;
              return null;
            },
            async run() {
              inserts.push({ sql, params });
              return { meta: { changes: 1 } };
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
  event: {
    signal_key: 'forecast.revenue.pace',
  },
};

test('resolves existing signal and contract', async () => {
  const db = fakeDb({
    signal: { id: 'sig_123', signal_key: 'forecast.revenue.pace' },
    contract: {
      id: 'contract_123',
      signal_id: 'sig_123',
      contract_json: JSON.stringify({
        dimensions: ['forecast_id', 'status'],
        default_bucket_types: ['minute', 'hour', 'day'],
        default_aggregate: 'last',
      }),
    },
  });

  const result = await resolveSignalAndContract(db, message);

  assert.equal(result.signal.id, 'sig_123');
  assert.equal(result.signalCreated, false);
  assert.equal(result.contract.default_aggregate, 'last');
  assert.deepEqual(result.contract.dimensions, ['forecast_id', 'status']);
  assert.equal(db.inserts.length, 0);
});

test('lazily creates missing signal and default contract', async () => {
  const db = fakeDb();
  const result = await resolveSignalAndContract(db, message, '2026-05-24T10:00:00.000Z');

  assert.equal(result.signalCreated, true);
  assert.equal(result.contractCreated, true);
  assert.equal(result.signal.signal_key, 'forecast.revenue.pace');
  assert.deepEqual(result.contract, DEFAULT_SIGNAL_CONTRACT);
  assert.equal(db.inserts.length, 2);
});
