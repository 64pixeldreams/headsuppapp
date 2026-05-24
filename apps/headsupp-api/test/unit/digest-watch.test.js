import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateDigestWatch } from '../../src/services/scheduled-watches/digest.js';

function digestDb({ lastDigestAt = null } = {}, batches = [], runs = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('watch_states')) return lastDigestAt ? { last_digest_at: lastDigestAt } : null;
              if (sql.includes('aggregates')) return { last_value: 64, bucket_type: 'day', bucket_start_at: '2026-05-24T00:00:00.000Z' };
              return null;
            },
            async all() {
              if (sql.includes('subscribers')) return { results: [] };
              return { results: [] };
            },
            async run() {
              runs.push({ sql, params });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(items) {
      batches.push(...items);
    },
  };
}

const watch = {
  id: 'watch_digest',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_123',
  name: 'Daily digest',
  watch_type: 'DIGEST',
  config_json: JSON.stringify({ schedule: 'daily', include: ['status', 'last_value'] }),
};

test('digest watch creates alert when due', async () => {
  const batches = [];
  const runs = [];
  const result = await evaluateDigestWatch({
    db: digestDb({}, batches, runs),
    watch,
    now: '2026-05-24T09:00:00.000Z',
  });

  assert.equal(result.triggered, true);
  assert.equal(result.alert.severity, 'info');
  assert.equal(batches.length, 2);
  assert.ok(runs.some((run) => run.sql.includes('last_digest_at')));
});

test('digest watch skips when not due', async () => {
  const result = await evaluateDigestWatch({
    db: digestDb({ lastDigestAt: '2026-05-24T08:00:00.000Z' }),
    watch,
    now: '2026-05-24T09:00:00.000Z',
  });

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'DIGEST_NOT_DUE');
});
