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
