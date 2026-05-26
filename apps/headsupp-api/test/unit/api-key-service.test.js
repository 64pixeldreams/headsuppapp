import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createServiceApiKey,
  hasOperatorBootstrapAuth,
  listServiceApiKeys,
  revokeServiceApiKey,
  rotateServiceApiKey,
} from '../../src/services/auth/api-key-service.js';

function memoryKv() {
  const data = new Map();
  return {
    async get(key, type) {
      const value = data.get(key) || null;
      return type === 'json' && typeof value === 'string' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
    data,
  };
}

function env() {
  const keys = memoryKv();
  const lists = memoryKv();
  return {
    HEADSUPP_KEYS: keys,
    HEADSUPP_LISTS: lists,
    _keys: keys,
    _lists: lists,
  };
}

const managerAuth = {
  user_id: 'operator:one',
  permissions: ['api_key:manage'],
};

test('bootstrap creates hashed service API key and returns raw key once', async () => {
  const runtime = env();
  const result = await createServiceApiKey({
    env: runtime,
    input: { name: 'Smoke service', permissions: ['workspace:create'] },
    bootstrapToken: 'bootstrap-secret',
    providedBootstrapToken: 'bootstrap-secret',
    apiKeyFactory: () => 'hu_test_key_material',
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.api_key, 'hu_test_key_material');
  assert.equal(result.key.name, 'Smoke service');
  assert.equal(result.key.permissions.includes('workspace:create'), true);
  assert.notEqual(result.key.key_hash, 'hu_test_key_material');

  const stored = await runtime.HEADSUPP_KEYS.get(`apikey:${result.key.key_hash}`, 'json');
  assert.equal(stored.active, true);
  assert.equal(stored.name, 'Smoke service');
});

test('bootstrap auth trims whitespace on compared tokens', () => {
  assert.equal(
    hasOperatorBootstrapAuth(null, ' bootstrap-secret\n', 'bootstrap-secret '),
    true,
  );
});

test('bootstrap rejects missing operator authorization', async () => {
  const result = await createServiceApiKey({
    env: env(),
    input: { name: 'Denied' },
    bootstrapToken: 'bootstrap-secret',
    providedBootstrapToken: 'wrong',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'BOOTSTRAP_AUTH_REQUIRED');
});

test('lists, revokes, and rotates service API keys without exposing raw key material', async () => {
  const runtime = env();
  const created = await createServiceApiKey({
    env: runtime,
    auth: managerAuth,
    input: { name: 'Managed key', permissions: ['api_key:manage'] },
    apiKeyFactory: () => 'hu_first_key',
    now: '2026-05-24T10:00:00.000Z',
  });
  assert.equal(created.ok, true);

  const listed = await listServiceApiKeys({ env: runtime, auth: managerAuth });
  assert.equal(listed.keys.length, 1);
  assert.equal(listed.keys[0].api_key, undefined);

  const revoked = await revokeServiceApiKey({
    env: runtime,
    auth: managerAuth,
    input: { key_id: created.key.key_id },
    now: '2026-05-24T10:05:00.000Z',
  });
  assert.equal(revoked.ok, true);
  assert.equal(revoked.key.status, 'revoked');

  const rotated = await rotateServiceApiKey({
    env: runtime,
    auth: managerAuth,
    input: { key_id: created.key.key_id, permissions: ['api_key:manage'] },
    apiKeyFactory: () => 'hu_second_key',
    now: '2026-05-24T10:10:00.000Z',
  });
  assert.equal(rotated.ok, true);
  assert.equal(rotated.key.rotated_from_key_id, created.key.key_id);
  assert.equal(rotated.api_key, 'hu_second_key');
});
