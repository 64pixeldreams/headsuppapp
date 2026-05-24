import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeAffectedWatchEvaluators } from '../../src/services/aggregation/watch-invocation.js';

test('invokes WatchEvaluator DO for affected signal watches', async () => {
  const fetches = [];
  const db = {
    prepare(sql) {
      assert.match(sql, /enabled = 1/);
      return {
        bind(channelId, signalId) {
          assert.equal(channelId, 'ch_123');
          assert.equal(signalId, 'sig_123');
          return {
            async all() {
              return {
                results: [{ watch_id: 'watch_warning', signal_id: 'sig_123' }],
              };
            },
          };
        },
      };
    },
  };
  const env = {
    WATCH_EVALUATOR: {
      idFromName(name) {
        return `id:${name}`;
      },
      get(id) {
        assert.equal(id, 'id:watch_warning');
        return {
          async fetch(_url, init) {
            fetches.push(JSON.parse(init.body));
            return new Response('{}', { status: 202 });
          },
        };
      },
    },
  };

  const results = await invokeAffectedWatchEvaluators({
    db,
    env,
    aggregateDeltas: [
      {
        channel_id: 'ch_123',
        signal_id: 'sig_123',
        bucket_type: 'hour',
        bucket_start_at: '2026-05-24T10:00:00.000Z',
      },
    ],
    now: '2026-05-24T10:05:00.000Z',
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].invoked, true);
  assert.deepEqual(fetches[0], {
    watchId: 'watch_warning',
    reason: 'aggregate_updated',
    signalId: 'sig_123',
    bucketType: 'hour',
    bucketStartAt: '2026-05-24T10:00:00.000Z',
    now: '2026-05-24T10:05:00.000Z',
  });
});
