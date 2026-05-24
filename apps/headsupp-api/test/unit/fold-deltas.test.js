import assert from 'node:assert/strict';
import test from 'node:test';

import { foldAggregateDeltas } from '../../src/services/aggregation/fold-deltas.js';

const baseDelta = {
  id: 'sig_1:minute:2026-05-24T10:00:00.000Z',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_1',
  bucket_type: 'minute',
  bucket_start_at: '2026-05-24T10:00:00.000Z',
  sum_value: 10,
  count_value: 1,
  min_value: 10,
  max_value: 10,
  last_value: 10,
  avg_value: 10,
  first_event_at: '2026-05-24T10:00:01.000Z',
  last_event_at: '2026-05-24T10:00:01.000Z',
  updated_at: '2026-05-24T10:00:02.000Z',
};

test('folds aggregate deltas for the same signal bucket', () => {
  const folded = foldAggregateDeltas([
    baseDelta,
    {
      ...baseDelta,
      sum_value: 20,
      min_value: 20,
      max_value: 20,
      last_value: 20,
      first_event_at: '2026-05-24T10:00:03.000Z',
      last_event_at: '2026-05-24T10:00:03.000Z',
    },
  ]);

  assert.equal(folded.length, 1);
  assert.equal(folded[0].sum_value, 30);
  assert.equal(folded[0].count_value, 2);
  assert.equal(folded[0].min_value, 10);
  assert.equal(folded[0].max_value, 20);
  assert.equal(folded[0].last_value, 20);
  assert.equal(folded[0].avg_value, 15);
});

test('keeps separate buckets separate', () => {
  const folded = foldAggregateDeltas([
    baseDelta,
    {
      ...baseDelta,
      bucket_type: 'hour',
      bucket_start_at: '2026-05-24T10:00:00.000Z',
      id: 'sig_1:hour:2026-05-24T10:00:00.000Z',
    },
  ]);

  assert.equal(folded.length, 2);
});
