import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORETIC_SERVICE_PERMISSIONS,
  PERMISSION_PROFILES,
  hasPermission,
  requireForeticProvision,
  requirePermission,
  sanitizeAuthContext,
} from '../../src/services/auth/permissions.js';

const serviceAuth = {
  type: 'api',
  user_id: 'user:foretic-service',
  email: 'foretic-integration@headsupp.internal',
  permissions: FORETIC_SERVICE_PERMISSIONS,
};

test('Foretic service permissions map to foretic:provisioner profile', () => {
  assert.ok(FORETIC_SERVICE_PERMISSIONS.includes('foretic:provision'));
  assert.equal(FORETIC_SERVICE_PERMISSIONS.length, 1);
  assert.deepEqual(FORETIC_SERVICE_PERMISSIONS, PERMISSION_PROFILES['foretic:provisioner']);
});

test('permission profiles expose expected integration defaults', () => {
  assert.ok(PERMISSION_PROFILES['headsupp:admin'].includes('watch:control'));
  assert.ok(PERMISSION_PROFILES['foretic:runtime'].includes('alert:read'));
});

test('hasPermission allows explicit permission', () => {
  assert.equal(hasPermission(serviceAuth, 'foretic:provision'), true);
});

test('hasPermission allows wildcard permission', () => {
  assert.equal(hasPermission({ ...serviceAuth, permissions: ['*'] }, 'foretic:provision'), true);
});

test('hasPermission rejects missing permission', () => {
  assert.equal(hasPermission({ ...serviceAuth, permissions: ['workspace:create'] }, 'foretic:provision'), false);
});

test('requirePermission rejects missing auth', () => {
  assert.deepEqual(requirePermission(null, 'foretic:provision'), {
    ok: false,
    status: 401,
    code: 'AUTH_REQUIRED',
    message: 'Authentication is required.',
  });
});

test('requireForeticProvision rejects auth without provisioning permission', () => {
  assert.deepEqual(requireForeticProvision({ ...serviceAuth, permissions: ['workspace:create'] }), {
    ok: false,
    status: 403,
    code: 'PERMISSION_DENIED',
    message: "Permission 'foretic:provision' is required.",
  });
});

test('requireForeticProvision accepts Foretic service auth', () => {
  assert.deepEqual(requireForeticProvision(serviceAuth), {
    ok: true,
    user_id: 'user:foretic-service',
    permission: 'foretic:provision',
  });
});

test('sanitizeAuthContext returns safe auth summary', () => {
  assert.deepEqual(sanitizeAuthContext({ ...serviceAuth, secret: 'do-not-leak' }), {
    type: 'api',
    user_id: 'user:foretic-service',
    email: 'foretic-integration@headsupp.internal',
    permissions: FORETIC_SERVICE_PERMISSIONS,
    has_foretic_provision: true,
  });
});
