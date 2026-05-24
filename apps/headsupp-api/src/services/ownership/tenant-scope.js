function missingResult(resourceName) {
  return {
    ok: false,
    status: 404,
    code: 'NOT_FOUND',
    message: `${resourceName} was not found.`,
  };
}

function mismatchResult(field) {
  return {
    ok: false,
    status: 403,
    code: 'TENANT_SCOPE_MISMATCH',
    message: `Resource ${field} does not match the requested tenant scope.`,
  };
}

export function requireTenantResource(resource, context, resourceName = 'Resource') {
  if (!resource) return missingResult(resourceName);
  if (resource.source_app !== context.source_app) return mismatchResult('source_app');
  if (resource.external_tenant_id !== context.external_tenant_id) return mismatchResult('external_tenant_id');

  return {
    ok: true,
    resource,
  };
}

export function requireWorkspaceResource(resource, context, workspaceId, resourceName = 'Resource') {
  const tenant = requireTenantResource(resource, context, resourceName);
  if (!tenant.ok) return tenant;

  if (workspaceId && resource.workspace_id !== workspaceId) {
    return mismatchResult('workspace_id');
  }

  return {
    ok: true,
    resource,
  };
}

export function requireChannelInWorkspace(channel, workspace, context) {
  const workspaceCheck = requireTenantResource(workspace, context, 'Workspace');
  if (!workspaceCheck.ok) return workspaceCheck;

  const channelCheck = requireWorkspaceResource(channel, context, workspace.workspace_id, 'Channel');
  if (!channelCheck.ok) return channelCheck;

  return {
    ok: true,
    workspace,
    channel,
  };
}

export function ownershipFieldsFromContext(context, extra = {}) {
  return {
    source_app: context.source_app,
    external_tenant_id: context.external_tenant_id,
    external_user_id: context.external_user_id,
    external_account_id: context.external_account_id || null,
    external_resource_id: context.external_resource_id || null,
    ...extra,
  };
}
