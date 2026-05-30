import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SIGNAL_CONTRACT, resolveSignalAndContract } from '../../src/services/aggregation/signal-resolution.js';

function fakeDb({ signal = null, contract = null, channelContract = null } = {}) {
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
              if (sql.includes('FROM channel_contracts')) return channelContract;
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
  assert.equal(result.signal.id, result.signal.signal_id);
  assert.deepEqual(result.contract, DEFAULT_SIGNAL_CONTRACT);
  assert.equal(db.inserts.length, 2);
});

test('lazily created signal contracts inherit active channel contract defaults', async () => {
  const db = fakeDb({
    channelContract: {
      default_dimensions_json: '["forecast_id","status"]',
      cta_policy_json: '{"required":true}',
    },
  });
  const result = await resolveSignalAndContract(db, message, '2026-05-24T10:00:00.000Z');

  assert.equal(result.contractCreated, true);
  assert.deepEqual(result.contract.dimensions, ['forecast_id', 'status']);
  assert.deepEqual(result.contract.cta_policy, { required: true });
});

test('generates different signal ids for long channel keys and different signal keys', async () => {
  const db = fakeDb();
  const longChannel = 'ch_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mn9cxnv3muoleo';
  const baseMessage = {
    workspaceId: 'ws_123',
    channelId: longChannel,
    event: { signal_key: 'forecast.revenue.pace' },
  };
  const first = await resolveSignalAndContract(db, baseMessage, '2026-05-24T10:00:00.000Z');
  const firstSignalInsert = db.inserts.find((entry) => entry.sql.includes('INSERT INTO signals'));
  assert.ok(firstSignalInsert);
  const firstId = first.signal.id;

  const db2 = fakeDb();
  const second = await resolveSignalAndContract(
    db2,
    { ...baseMessage, event: { signal_key: 'forecast.goal.risk' } },
    '2026-05-24T10:00:00.000Z',
  );
  const secondSignalInsert = db2.inserts.find((entry) => entry.sql.includes('INSERT INTO signals'));
  assert.ok(secondSignalInsert);
  const secondId = second.signal.id;

  assert.notEqual(firstId, secondId);
});
