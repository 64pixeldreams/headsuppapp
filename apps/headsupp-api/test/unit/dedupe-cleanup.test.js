import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanupRawEventDedupe, dedupeCleanupCutoff } from '../../src/services/scheduler/dedupe-cleanup.js';

test('calculates raw event dedupe cleanup cutoff', () => {
  assert.equal(
    dedupeCleanupCutoff('2026-05-24T10:00:00.000Z', 72),
    '2026-05-21T10:00:00.000Z',
  );
});

test('deletes raw event dedupe rows older than cutoff', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async run() {
              return { meta: { changes: 3 } };
            },
          };
        },
      };
    },
  };

  const result = await cleanupRawEventDedupe(db, {
    now: '2026-05-24T10:00:00.000Z',
    retentionHours: 24,
  });

  assert.equal(result.deleted, 3);
  assert.equal(calls[0].sql, 'DELETE FROM raw_event_dedupe WHERE received_at < ?');
  assert.equal(calls[0].params[0], '2026-05-23T10:00:00.000Z');
});
