import { requireForeticProvision } from '../auth/permissions.js';
import { stableId } from '../ids/stable-id.js';
import { ownershipFieldsFromContext } from '../ownership/tenant-scope.js';
import { foreticWorkspaceKey, normalizeForeticTenantContext } from './tenant-context.js';

export async function provisionForeticWorkspace({ auth, input, store, now = new Date().toISOString() }) {
  const permission = requireForeticProvision(auth);
  if (!permission.ok) return permission;

  const normalized = normalizeForeticTenantContext(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: 400,
      code: normalized.code,
      message: normalized.message,
    };
  }

  const { context } = normalized;
  const workspaceKey = foreticWorkspaceKey(context);
  const existing = await store.get('workspace', workspaceKey);
  if (existing) {
    return {
      ok: true,
      created: false,
      workspace: existing,
    };
  }

  const workspace = {
    workspace_id: stableId('ws', workspaceKey),
    workspace_key: workspaceKey,
    name: input.name || `Foretic / ${context.external_tenant_id}`,
    status: 'active',
    user_id: auth.user_id,
    created_by: auth.user_id,
    updated_by: auth.user_id,
    created_at: now,
    updated_at: now,
    ...ownershipFieldsFromContext(context),
  };

  await store.put('workspace', workspaceKey, workspace);

  return {
    ok: true,
    created: true,
    workspace,
  };
}
