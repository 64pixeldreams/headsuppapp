import assert from 'node:assert/strict';
import test from 'node:test';

import { AGGREGATE_UPSERT_SQL, upsertAggregateDelta } from '../../src/services/aggregation/aggregate-upsert.js';

const delta = {
  id: 'sig_1:minute:2026-05-24T10:00:00.000Z',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_1',
  bucket_type: 'minute',
  bucket_start_at: '2026-05-24T10:00:00.000Z',
  dimensions_hash: 'd0',
  dimensions_json: '{}',
  event_context: { cta: { label: 'View', url: 'https://example.com' }, fields: { forecast_id: 'fc_123' } },
  sum_value: 30,
  count_value: 2,
  min_value: 10,
  max_value: 20,
  last_value: 20,
  avg_value: 15,
  first_event_at: '2026-05-24T10:00:01.000Z',
  last_event_at: '2026-05-24T10:00:03.000Z',
  updated_at: '2026-05-24T10:00:04.000Z',
};

test('aggregate upsert SQL uses atomic conflict update', () => {
  assert.match(AGGREGATE_UPSERT_SQL, /ON CONFLICT\(signal_id, bucket_type, bucket_start_at, dimensions_hash\)/);
  assert.match(AGGREGATE_UPSERT_SQL, /sum_value = aggregates\.sum_value \+ excluded\.sum_value/);
  assert.match(AGGREGATE_UPSERT_SQL, /count_value = aggregates\.count_value \+ excluded\.count_value/);
  assert.match(AGGREGATE_UPSERT_SQL, /excluded\.last_event_at >= aggregates\.last_event_at/);
  assert.match(AGGREGATE_UPSERT_SQL, /last_event_context_json/);
});

test('upserts aggregate delta with bound values', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  await upsertAggregateDelta(db, delta);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[0], delta.id);
  assert.equal(calls[0].params[6], 'd0');
  assert.deepEqual(JSON.parse(calls[0].params[8]), delta.event_context);
  assert.equal(calls[0].params[9], 30);
  assert.equal(calls[0].params[17], delta.updated_at);
});
