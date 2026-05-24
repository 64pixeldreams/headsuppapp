import { requirePermission } from '../auth/permissions.js';
import { generateConnectorSecret, publicConnector } from '../connectors/secrets.js';
import { stableId } from '../ids/stable-id.js';
import { validateSubscriberUrl, redactUrl } from '../subscribers/urls.js';

function denyIfNeeded(auth, permission) {
  const allowed = requirePermission(auth, permission);
  return allowed.ok ? null : allowed;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildWorkspaceRow(input, now = new Date().toISOString()) {
  const workspaceKey = input.workspace_key || `${input.source_app || 'headsupp'}:${normalizeKey(input.name)}`;
  const id = input.workspace_id || stableId('ws', workspaceKey);
  return {
    id,
    workspace_id: id,
    workspace_key: workspaceKey,
    name: input.name,
    source_app: input.source_app || 'headsupp',
    external_tenant_id: input.external_tenant_id || id,
    external_user_id: input.external_user_id || null,
    status: input.status || 'active',
    created_at: now,
    updated_at: now,
  };
}

export function buildChannelRow(input, now = new Date().toISOString()) {
  const channelKey = input.channel_key || `${input.workspace_id}:${normalizeKey(input.name)}`;
  const id = input.channel_id || stableId('ch', channelKey);
  return {
    id,
    channel_id: id,
    workspace_id: input.workspace_id,
    name: input.name,
    channel_key: channelKey,
    purpose: input.purpose || null,
    status: input.status || 'active',
    source_app: input.source_app || null,
    external_tenant_id: input.external_tenant_id || null,
    external_user_id: input.external_user_id || null,
    external_resource_id: input.external_resource_id || null,
    created_at: now,
    updated_at: now,
  };
}

export function buildConnectorRow(input, now = new Date().toISOString(), secretFactory = generateConnectorSecret) {
  const connectorKeySeed = input.connector_key || `${input.channel_id}:${input.connector_type || 'webhook'}`;
  const id = input.connector_id || stableId('conn', connectorKeySeed);
  return {
    id,
    connector_id: id,
    workspace_id: input.workspace_id,
    channel_id: input.channel_id,
    connector_type: input.connector_type || 'webhook',
    connector_key: input.connector_key || stableId('ck', connectorKeySeed),
    secret_hash: null,
    connector_secret: secretFactory(),
    config_json: JSON.stringify(input.config || {}),
    status: input.status || 'active',
    enabled: input.enabled === false ? 0 : 1,
    source_app: input.source_app || null,
    external_tenant_id: input.external_tenant_id || null,
    external_user_id: input.external_user_id || null,
    external_resource_id: input.external_resource_id || null,
    created_at: now,
    updated_at: now,
  };
}

export function buildSubscriberRow(input, now = new Date().toISOString()) {
  const validation = validateSubscriberUrl(input.subscriber_type || 'webhook', input.destination_url);
  if (!validation.ok) return validation;
  const key = input.subscriber_key || `${input.channel_id}:${input.subscriber_type || 'webhook'}:${input.destination_url}`;
  const id = input.subscriber_id || stableId('sub', key);
  return {
    ok: true,
    row: {
      id,
      subscriber_id: id,
      workspace_id: input.workspace_id,
      channel_id: input.channel_id,
      subscriber_type: input.subscriber_type || 'webhook',
      name: input.name || input.display_name || 'Webhook subscriber',
      destination_url: input.destination_url,
      destination_url_redacted: redactUrl(input.destination_url),
      secret_hash: null,
      mode: input.mode || 'alert',
      config_json: JSON.stringify(input.config || {}),
      enabled: input.enabled === false ? 0 : 1,
      source_app: input.source_app || null,
      external_tenant_id: input.external_tenant_id || null,
      external_user_id: input.external_user_id || null,
      external_resource_id: input.external_resource_id || null,
      created_at: now,
      updated_at: now,
    },
  };
}

export function buildSignalRow(input, now = new Date().toISOString()) {
  const id = input.signal_id || stableId('sig', `${input.channel_id}:${input.signal_key}`);
  return {
    id,
    signal_id: id,
    workspace_id: input.workspace_id,
    channel_id: input.channel_id,
    signal_key: input.signal_key,
    signal_type: input.signal_type || 'metric',
    value_mode: input.value_mode || 'last',
    unit: input.unit || null,
    description: input.description || null,
    status: input.status || 'active',
    created_at: now,
    updated_at: now,
  };
}

export function buildWatchRow(input, now = new Date().toISOString()) {
  const id = input.watch_id || stableId('watch', `${input.signal_id}:${input.name}:${input.watch_type}`);
  return {
    id,
    watch_id: id,
    workspace_id: input.workspace_id,
    channel_id: input.channel_id,
    signal_id: input.signal_id,
    name: input.name,
    watch_type: input.watch_type,
    config_json: JSON.stringify(input.config || {}),
    cooldown_seconds: Number(input.cooldown_seconds ?? 86400),
    escalation_json: input.escalation ? JSON.stringify(input.escalation) : null,
    recovery_json: input.recovery ? JSON.stringify(input.recovery) : null,
    enabled: input.enabled === false ? 0 : 1,
    created_at: now,
    updated_at: now,
  };
}

async function insertRow(db, table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  await db
    .prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`)
    .bind(...columns.map((column) => row[column]))
    .run();
  return row;
}

async function firstRow(db, sql, params = []) {
  if (typeof db.prepare !== 'function') return null;
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.first === 'function') return prepared.first();
  return null;
}

function tenantMismatch(auth, row) {
  if (!row) return false;
  if (auth?.source_app && row.source_app && auth.source_app !== row.source_app) return true;
  if (auth?.external_tenant_id && row.external_tenant_id && auth.external_tenant_id !== row.external_tenant_id) return true;
  return false;
}

async function loadWorkspace(db, workspaceId) {
  return firstRow(db, 'SELECT * FROM workspaces WHERE id = ? OR workspace_id = ? LIMIT 1', [workspaceId, workspaceId]);
}

async function loadChannel(db, channelId) {
  return firstRow(db, 'SELECT * FROM channels WHERE id = ? OR channel_id = ? LIMIT 1', [channelId, channelId]);
}

async function loadSignal(db, signalId) {
  return firstRow(db, 'SELECT * FROM signals WHERE id = ? OR signal_id = ? LIMIT 1', [signalId, signalId]);
}

function ownershipError(code, message) {
  return { ok: false, status: 403, code, message };
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

async function requireSignalScope({ db, auth, workspaceId, channelId, signalId }) {
  const signal = await loadSignal(db, signalId);
  if (!signal) return null;
  if (signal.workspace_id !== workspaceId || signal.channel_id !== channelId) {
    return ownershipError('SIGNAL_SCOPE_MISMATCH', 'Signal does not belong to workspace and channel.');
  }
  if (tenantMismatch(auth, signal)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Signal is outside the authenticated tenant scope.');
  }
  return null;
}

function inheritOwnership(input, parent = {}) {
  return {
    ...input,
    source_app: input.source_app || parent.source_app || null,
    external_tenant_id: input.external_tenant_id || parent.external_tenant_id || null,
    external_user_id: input.external_user_id || parent.external_user_id || null,
  };
}

export async function createAdminWorkspace({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'workspace:create');
  if (denied) return denied;
  const row = buildWorkspaceRow(input, now);
  return { ok: true, workspace: await insertRow(db, 'workspaces', row) };
}

export async function createAdminChannel({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'channel:create');
  if (denied) return denied;
  const scopeDenied = await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id });
  if (scopeDenied) return scopeDenied;
  const workspace = await loadWorkspace(db, input.workspace_id);
  const row = buildChannelRow(inheritOwnership(input, workspace), now);
  return { ok: true, channel: await insertRow(db, 'channels', row) };
}

export async function createAdminConnector({ auth, db, input, now, secretFactory, store }) {
  const denied = denyIfNeeded(auth, 'connector:create');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const channel = await loadChannel(db, input.channel_id);
  const row = buildConnectorRow(inheritOwnership(input, channel), now, secretFactory);
  await insertRow(db, 'connectors', row);
  if (store) await store.put('connector_by_key', row.connector_key, row);
  return { ok: true, connector: publicConnector(row, { includeSecret: true }) };
}

export async function createAdminSubscriber({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'subscriber:create');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const channel = await loadChannel(db, input.channel_id);
  const built = buildSubscriberRow(inheritOwnership(input, channel), now);
  if (!built.ok) return built;
  const subscriber = await insertRow(db, 'subscribers', built.row);
  return { ok: true, subscriber: { ...subscriber, destination_url: undefined } };
}

export async function createAdminSignal({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'signal:create');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const row = buildSignalRow(input, now);
  await insertRow(db, 'signals', row);
  if (input.contract) {
    await insertRow(db, 'signal_contracts', {
      id: input.signal_contract_id || stableId('sigct', row.id),
      signal_contract_id: input.signal_contract_id || stableId('sigct', row.id),
      signal_id: row.id,
      contract_json: JSON.stringify(input.contract),
      created_at: now,
      updated_at: now,
    });
  }
  return { ok: true, signal: row };
}

export async function createAdminWatch({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'watch:create');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id })) ||
    (await requireSignalScope({
      db,
      auth,
      workspaceId: input.workspace_id,
      channelId: input.channel_id,
      signalId: input.signal_id,
    }));
  if (scopeDenied) return scopeDenied;
  const row = buildWatchRow(input, now);
  return { ok: true, watch: await insertRow(db, 'watches', row) };
}
