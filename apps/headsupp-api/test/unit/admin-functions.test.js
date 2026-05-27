import assert from 'node:assert/strict';
import test from 'node:test';

import { registerAdminFunctions } from '../../src/functions/admin-functions.js';

test('admin functions return schema mismatch errors for missing D1 columns', async () => {
  const handlers = new Map();
  await registerAdminFunctions({
    define(action, handler) {
      handlers.set(action, handler);
    },
  });

  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (/FROM workspaces/.test(sql)) {
                return {
                  id: 'ws_123',
                  workspace_id: 'ws_123',
                  source_app: 'foretic',
                  external_tenant_id: 'user:123',
                  external_user_id: 'user:123',
                };
              }
              return null;
            },
            async run() {
              if (/INSERT OR IGNORE INTO channels/.test(sql)) {
                throw new Error('D1_ERROR: table channels has no column named metadata_json: SQLITE_ERROR');
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  const response = await handlers.get('admin.createChannel')({
    auth: {
      user_id: 'service:foretic',
      permissions: ['channel:create'],
      source_app: 'foretic',
    },
    payload: {
      workspace_id: 'ws_123',
      channel_key: 'foretic:user:123:forecast:abc',
      name: 'Forecast',
      source_app: 'foretic',
      external_tenant_id: 'user:123',
      external_user_id: 'user:123',
      metadata: { forecast_id: 'abc' },
    },
    env: { DB: db },
    requestId: 'req_schema',
  });

  assert.equal(response.success, false);
  assert.equal(response.error.code, 'SCHEMA_MISMATCH');
  assert.equal(response.error.status, 503);
  assert.equal(response.error.details.table, 'channels');
  assert.equal(response.error.details.column, 'metadata_json');
});
