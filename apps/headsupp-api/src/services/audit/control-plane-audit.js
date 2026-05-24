import { stableId } from '../ids/stable-id.js';

function scrub(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrub);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/secret|api_key|token|destination_url|webhook/i.test(key)) {
      output[key] = '[redacted]';
    } else {
      output[key] = scrub(item);
    }
  }
  return output;
}

export function buildAuditRow({
  action,
  auth = null,
  targetType = null,
  targetId = null,
  input = {},
  success = true,
  errorCode = null,
  requestId = null,
  now = new Date().toISOString(),
}) {
  const workspaceId = input.workspace_id || input.workspaceId || null;
  const sourceApp = input.source_app || auth?.source_app || null;
  const externalTenantId = input.external_tenant_id || auth?.external_tenant_id || null;
  const actorId = auth?.key_id || auth?.user_id || 'operator-bootstrap';
  return {
    id: stableId('audit', `${action}:${actorId}:${targetId || 'none'}:${now}`),
    action,
    actor_user_id: auth?.user_id || null,
    actor_key_id: auth?.key_id || null,
    target_type: targetType,
    target_id: targetId,
    source_app: sourceApp,
    external_tenant_id: externalTenantId,
    workspace_id: workspaceId,
    request_id: requestId,
    success: success ? 1 : 0,
    error_code: errorCode,
    metadata_json: JSON.stringify(scrub(input || {})),
    created_at: now,
  };
}

export async function writeAuditLog({ db, ...options }) {
  if (!db) return null;
  const row = buildAuditRow(options);
  await db
    .prepare(
      `INSERT INTO control_plane_audit_logs (
        id, action, actor_user_id, actor_key_id, target_type, target_id, source_app,
        external_tenant_id, workspace_id, request_id, success, error_code, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.action,
      row.actor_user_id,
      row.actor_key_id,
      row.target_type,
      row.target_id,
      row.source_app,
      row.external_tenant_id,
      row.workspace_id,
      row.request_id,
      row.success,
      row.error_code,
      row.metadata_json,
      row.created_at,
    )
    .run();
  return row;
}

export async function listAuditLogs({ db, limit = 50 }) {
  const result = await db
    .prepare(
      `SELECT id, action, actor_user_id, actor_key_id, target_type, target_id, source_app,
        external_tenant_id, workspace_id, request_id, success, error_code, metadata_json, created_at
       FROM control_plane_audit_logs
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(Math.min(Math.max(Number(limit) || 50, 1), 100))
    .all();
  return result?.results || [];
}
