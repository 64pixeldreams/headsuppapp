import { requirePermission } from '../auth/permissions.js';

function denyIfNeeded(auth, permission) {
  const allowed = requirePermission(auth, permission);
  return allowed.ok ? null : allowed;
}

async function firstRow(db, sql, params = []) {
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.first === 'function') return prepared.first();
  return null;
}

async function allRows(db, sql, params = []) {
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.all !== 'function') return [];
  const result = await prepared.all();
  return result?.results || [];
}

function tenantMismatch(auth, row) {
  if (!row) return false;
  if (auth?.source_app && row.source_app && auth.source_app !== row.source_app) return true;
  if (auth?.external_tenant_id && row.external_tenant_id && auth.external_tenant_id !== row.external_tenant_id) return true;
  return false;
}

function ownershipError(code, message) {
  return { ok: false, status: 403, code, message };
}

async function loadWorkspace(db, workspaceId) {
  return firstRow(db, 'SELECT * FROM workspaces WHERE id = ? OR workspace_id = ? LIMIT 1', [workspaceId, workspaceId]);
}

async function loadChannel(db, channelId) {
  return firstRow(db, 'SELECT * FROM channels WHERE id = ? OR channel_id = ? LIMIT 1', [channelId, channelId]);
}

async function loadWatch(db, watchId) {
  return firstRow(db, 'SELECT * FROM watches WHERE id = ? OR watch_id = ? LIMIT 1', [watchId, watchId]);
}

async function requireWorkspaceScope({ db, auth, workspaceId }) {
  const workspace = await loadWorkspace(db, workspaceId);
  if (!workspace) return null;
  if (tenantMismatch(auth, workspace)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Workspace is outside the authenticated tenant scope.');
  }
  return null;
}

async function requireChannelScope({ db, auth, workspaceId, channelId }) {
  const channel = await loadChannel(db, channelId);
  if (!channel) return null;
  if (channel.workspace_id !== workspaceId) {
    return ownershipError('WORKSPACE_CHANNEL_MISMATCH', 'Channel does not belong to workspace.');
  }
  if (tenantMismatch(auth, channel)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Channel is outside the authenticated tenant scope.');
  }
  return null;
}

async function requireWatchScope({ db, auth, workspaceId, channelId, watchId }) {
  const watch = await loadWatch(db, watchId);
  if (!watch) return { ok: false, status: 404, code: 'WATCH_NOT_FOUND', message: 'Watch was not found.' };
  if (watch.workspace_id !== workspaceId || watch.channel_id !== channelId) {
    return ownershipError('WATCH_SCOPE_MISMATCH', 'Watch does not belong to workspace and channel.');
  }
  if (tenantMismatch(auth, watch)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Watch is outside the authenticated tenant scope.');
  }
  return null;
}

function parsePayload(row) {
  try {
    return row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    return {};
  }
}

function safeAlert(row) {
  const payload = parsePayload(row);
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    channel_id: row.channel_id,
    signal_id: row.signal_id,
    watch_id: row.watch_id,
    triggered_at: row.triggered_at,
    severity: row.severity,
    current_value: row.current_value,
    threshold_value: row.threshold_value,
    summary_text: row.summary_text,
    cta_label: row.cta_label || null,
    cta_url: row.cta_url || null,
    fields: payload.fields || {},
    created_at: row.created_at,
  };
}

function safeWatchState(row) {
  return {
    watch_id: row.watch_id,
    last_status: row.last_status || null,
    last_evaluated_at: row.last_evaluated_at || null,
    last_alert_at: row.last_alert_at || null,
    last_alert_value: row.last_alert_value ?? null,
    last_alert_severity: row.last_alert_severity || null,
    cooldown_until: row.cooldown_until || null,
    last_emitted_bucket_start_at: row.last_emitted_bucket_start_at || null,
    last_digest_at: row.last_digest_at || null,
    last_recovery_at: row.last_recovery_at || null,
    updated_at: row.updated_at,
  };
}

async function channelScopeDenied({ db, auth, input }) {
  return (
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }))
  );
}

export async function listAdminChannelAlerts({ auth, db, input, now = new Date().toISOString() }) {
  const denied = denyIfNeeded(auth, 'alert:read');
  if (denied) return denied;
  const scopeDenied = await channelScopeDenied({ db, auth, input });
  if (scopeDenied) return scopeDenied;
  const limit = Math.min(Number(input.limit || 50), 200);
  const rows = await allRows(
    db,
    `SELECT id, workspace_id, channel_id, signal_id, watch_id, triggered_at, severity, current_value, threshold_value,
      summary_text, payload_json, cta_label, cta_url, created_at
      FROM alerts
      WHERE workspace_id = ? AND channel_id = ?
      ORDER BY triggered_at DESC
      LIMIT ?`,
    [input.workspace_id, input.channel_id, limit],
  );
  const suppressed = await firstRow(
    db,
    `SELECT COUNT(*) AS count
      FROM watch_states
      WHERE watch_id IN (SELECT id FROM watches WHERE workspace_id = ? AND channel_id = ?)
        AND cooldown_until IS NOT NULL
        AND cooldown_until > ?`,
    [input.workspace_id, input.channel_id, now],
  );
  return {
    ok: true,
    alerts: rows.map(safeAlert),
    metadata: {
      suppressed_watch_count: Number(suppressed?.count || 0),
      as_of: now,
    },
  };
}

export async function getAdminWatchState({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'watch:read');
  if (denied) return denied;
  const scopeDenied =
    (await channelScopeDenied({ db, auth, input })) ||
    (await requireWatchScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id, watchId: input.watch_id }));
  if (scopeDenied) return scopeDenied;
  const row = await firstRow(db, 'SELECT * FROM watch_states WHERE watch_id = ? LIMIT 1', [input.watch_id]);
  return { ok: true, watch_state: row ? safeWatchState(row) : null };
}

export async function listAdminAlertTimeline({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'alert:read');
  if (denied) return denied;
  const scopeDenied = await channelScopeDenied({ db, auth, input });
  if (scopeDenied) return scopeDenied;
  const limit = Math.min(Number(input.limit || 100), 500);
  const rows = await allRows(
    db,
    `SELECT id, workspace_id, channel_id, signal_id, watch_id, triggered_at, severity, current_value, threshold_value,
      summary_text, payload_json, cta_label, cta_url, created_at
      FROM alerts
      WHERE workspace_id = ? AND channel_id = ?
      ORDER BY triggered_at DESC
      LIMIT ?`,
    [input.workspace_id, input.channel_id, limit],
  );
  return { ok: true, timeline: rows.map(safeAlert) };
}
