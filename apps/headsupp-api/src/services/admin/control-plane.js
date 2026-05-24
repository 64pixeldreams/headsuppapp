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

export async function createAdminWorkspace({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'workspace:create');
  if (denied) return denied;
  const row = buildWorkspaceRow(input, now);
  return { ok: true, workspace: await insertRow(db, 'workspaces', row) };
}

export async function createAdminChannel({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'channel:create');
  if (denied) return denied;
  const row = buildChannelRow(input, now);
  return { ok: true, channel: await insertRow(db, 'channels', row) };
}

export async function createAdminConnector({ auth, db, input, now, secretFactory }) {
  const denied = denyIfNeeded(auth, 'connector:create');
  if (denied) return denied;
  const row = buildConnectorRow(input, now, secretFactory);
  await insertRow(db, 'connectors', row);
  return { ok: true, connector: publicConnector(row, { includeSecret: true }) };
}

export async function createAdminSubscriber({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'subscriber:create');
  if (denied) return denied;
  const built = buildSubscriberRow(input, now);
  if (!built.ok) return built;
  return { ok: true, subscriber: await insertRow(db, 'subscribers', built.row) };
}

export async function createAdminSignal({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'signal:create');
  if (denied) return denied;
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
  const row = buildWatchRow(input, now);
  return { ok: true, watch: await insertRow(db, 'watches', row) };
}
