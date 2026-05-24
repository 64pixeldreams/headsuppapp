import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ownershipFieldsFromContext,
  requireChannelInWorkspace,
  requireTenantResource,
  requireWorkspaceResource,
} from '../../src/services/ownership/tenant-scope.js';

const context = {
  source_app: 'foretic',
  external_tenant_id: 'user:mkfoxvxgoyfbtd',
  external_user_id: 'user:mkfoxvxgoyfbtd',
  external_account_id: 'user:mkfoxvxgoyfbtd',
  external_resource_id: 'oracle_forecast:mlfl1bfqrxnbk1',
};

const workspace = {
  workspace_id: 'ws_123',
  ...ownershipFieldsFromContext(context),
};

const channel = {
  channel_id: 'ch_123',
  workspace_id: 'ws_123',
  ...ownershipFieldsFromContext(context),
};

test('tenant resource check allows matching Foretic tenant scope', () => {
  const result = requireTenantResource(workspace, context, 'Workspace');

  assert.equal(result.ok, true);
  assert.equal(result.resource.workspace_id, 'ws_123');
});

test('tenant resource check rejects source app mismatch', () => {
  const result = requireTenantResource({ ...workspace, source_app: 'other' }, context, 'Workspace');

  assert.deepEqual(result, {
    ok: false,
    status: 403,
    code: 'TENANT_SCOPE_MISMATCH',
    message: 'Resource source_app does not match the requested tenant scope.',
  });
});

test('tenant resource check rejects tenant mismatch', () => {
  const result = requireTenantResource(
    { ...workspace, external_tenant_id: 'user:other' },
    context,
    'Workspace',
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TENANT_SCOPE_MISMATCH');
  assert.match(result.message, /external_tenant_id/);
});

test('tenant resource check returns not found for missing resource', () => {
  assert.deepEqual(requireTenantResource(null, context, 'Workspace'), {
    ok: false,
    status: 404,
    code: 'NOT_FOUND',
    message: 'Workspace was not found.',
  });
});

test('workspace resource check rejects workspace mismatch', () => {
  const result = requireWorkspaceResource({ ...channel, workspace_id: 'ws_other' }, context, 'ws_123', 'Channel');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TENANT_SCOPE_MISMATCH');
  assert.match(result.message, /workspace_id/);
});

test('channel relationship check accepts channel in workspace', () => {
  const result = requireChannelInWorkspace(channel, workspace, context);

  assert.equal(result.ok, true);
  assert.equal(result.workspace.workspace_id, 'ws_123');
  assert.equal(result.channel.channel_id, 'ch_123');
});

test('ownershipFieldsFromContext copies tenant fields and extra fields', () => {
  assert.deepEqual(ownershipFieldsFromContext(context, { workspace_id: 'ws_123' }), {
    source_app: 'foretic',
    external_tenant_id: 'user:mkfoxvxgoyfbtd',
    external_user_id: 'user:mkfoxvxgoyfbtd',
    external_account_id: 'user:mkfoxvxgoyfbtd',
    external_resource_id: 'oracle_forecast:mlfl1bfqrxnbk1',
    workspace_id: 'ws_123',
  });
});
