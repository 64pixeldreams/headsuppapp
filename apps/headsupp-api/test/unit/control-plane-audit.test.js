import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAuditRow } from '../../src/services/audit/control-plane-audit.js';

test('control-plane audit rows redact secret fields', () => {
  const row = buildAuditRow({
    action: 'admin.createSubscriber',
    auth: { user_id: 'operator:one', key_id: 'key_hash', source_app: 'headsupp-smoke' },
    targetType: 'subscriber',
    targetId: 'sub_123',
    input: {
      workspace_id: 'ws_123',
      destination_url: 'https://hooks.slack.com/services/T_TEST/B_TEST/SECRET',
      connector_secret: 'hu_sec_test',
      nested: {
        api_key: 'hu_api_key',
      },
    },
    requestId: 'req_123',
    now: '2026-05-24T10:00:00.000Z',
  });

  const metadata = JSON.parse(row.metadata_json);
  assert.equal(row.action, 'admin.createSubscriber');
  assert.equal(row.actor_key_id, 'key_hash');
  assert.equal(row.workspace_id, 'ws_123');
  assert.equal(metadata.destination_url, '[redacted]');
  assert.equal(metadata.connector_secret, '[redacted]');
  assert.equal(metadata.nested.api_key, '[redacted]');
  assert.equal(row.success, 1);
});

test('control-plane audit row ids include request id to avoid same-second collisions', () => {
  const base = {
    action: 'admin.createWorkspace',
    auth: { user_id: 'service:foretic', key_id: 'key_hash' },
    targetType: null,
    targetId: null,
    input: { source_app: 'foretic' },
    success: false,
    errorCode: 'VALIDATION_ERROR',
    now: '2026-05-24T10:00:00.000Z',
  };

  const first = buildAuditRow({ ...base, requestId: 'req_one' });
  const second = buildAuditRow({ ...base, requestId: 'req_two' });

  assert.notEqual(first.id, second.id);
});
