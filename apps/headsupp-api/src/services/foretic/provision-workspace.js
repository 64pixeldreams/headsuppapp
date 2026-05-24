import { requireForeticProvision } from '../auth/permissions.js';
import { stableId } from '../ids/stable-id.js';
import { ownershipFieldsFromContext } from '../ownership/tenant-scope.js';
import { foreticWorkspaceKey, normalizeForeticTenantContext } from './tenant-context.js';

async function findWorkspace(db, workspaceKey) {
  return db.prepare('SELECT * FROM workspaces WHERE workspace_key = ? LIMIT 1').bind(workspaceKey).first();
}

async function insertWorkspace(db, workspace) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO workspaces (
        id, workspace_id, workspace_key, name, source_app, external_tenant_id, external_user_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      workspace.workspace_id,
      workspace.workspace_id,
      workspace.workspace_key,
      workspace.name,
      workspace.source_app || null,
      workspace.external_tenant_id || null,
      workspace.external_user_id || null,
      workspace.status,
      workspace.created_at,
      workspace.updated_at,
    )
    .run();
}

export async function provisionForeticWorkspace({ auth, input, store, db, now = new Date().toISOString() }) {
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
  const existing = db ? await findWorkspace(db, workspaceKey) : await store.get('workspace', workspaceKey);
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

  if (db) {
    await insertWorkspace(db, workspace);
  } else {
    await store.put('workspace', workspaceKey, workspace);
  }

  return {
    ok: true,
    created: true,
    workspace,
  };
}
