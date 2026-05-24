import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryControlPlaneStore } from '../../src/services/control-plane/kv-store.js';
import { provisionForeticWorkspace } from '../../src/services/foretic/provision-workspace.js';

const serviceAuth = {
  type: 'api',
  user_id: 'user:foretic-service',
  permissions: ['foretic:provision'],
};

const fixture = {
  user_id: 'user:mkfoxvxgoyfbtd',
  forecast_id: 'oracle_forecast:mlfl1bfqrxnbk1',
  name: 'RB sales history (stripe)',
};

test('provisions a Foretic workspace for current user-only tenant model', async () => {
  const store = createMemoryControlPlaneStore();
  const result = await provisionForeticWorkspace({
    auth: serviceAuth,
    input: fixture,
    store,
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.workspace.workspace_key, 'foretic:user:mkfoxvxgoyfbtd');
  assert.equal(result.workspace.name, 'RB sales history (stripe)');
  assert.equal(result.workspace.user_id, 'user:foretic-service');
  assert.equal(result.workspace.external_tenant_id, 'user:mkfoxvxgoyfbtd');
});

test('provisioning the same Foretic tenant is idempotent', async () => {
  const store = createMemoryControlPlaneStore();
  const first = await provisionForeticWorkspace({ auth: serviceAuth, input: fixture, store });
  const second = await provisionForeticWorkspace({ auth: serviceAuth, input: fixture, store });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.workspace.workspace_id, second.workspace.workspace_id);
  assert.equal(second.created, false);
});

test('different Foretic tenants create different workspaces', async () => {
  const store = createMemoryControlPlaneStore();
  const first = await provisionForeticWorkspace({ auth: serviceAuth, input: fixture, store });
  const second = await provisionForeticWorkspace({
    auth: serviceAuth,
    input: { ...fixture, user_id: 'user:other' },
    store,
  });

  assert.notEqual(first.workspace.workspace_id, second.workspace.workspace_id);
  assert.equal(second.workspace.workspace_key, 'foretic:user:other');
});

test('provisioning rejects auth without foretic provision permission', async () => {
  const result = await provisionForeticWorkspace({
    auth: { ...serviceAuth, permissions: ['workspace:create'] },
    input: fixture,
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, 'PERMISSION_DENIED');
});

test('provisioning rejects missing Foretic user context', async () => {
  const result = await provisionForeticWorkspace({
    auth: serviceAuth,
    input: { name: 'Missing user' },
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.code, 'MISSING_EXTERNAL_USER_ID');
});
