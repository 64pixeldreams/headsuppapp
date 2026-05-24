import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOperationalStatusRow } from '../../src/services/operational/status.js';

test('operational status redacts Slack URLs from error messages', () => {
  const row = buildOperationalStatusRow({
    key: 'scheduled_tasks',
    status: 'error',
    error: new Error('Failed https://hooks.slack.com/services/T_TEST/B_TEST/SECRET'),
    now: '2026-05-24T18:00:00.000Z',
  });

  assert.equal(row.status, 'error');
  assert.equal(row.last_failure_at, '2026-05-24T18:00:00.000Z');
  assert.equal(row.last_error_message.includes('SECRET'), false);
  assert.equal(row.last_error_message.includes('[redacted]'), true);
});
