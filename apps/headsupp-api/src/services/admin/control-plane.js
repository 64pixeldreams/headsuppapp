import { requirePermission } from '../auth/permissions.js';
import { generateConnectorSecret, publicConnector } from '../connectors/secrets.js';
import { stableId } from '../ids/stable-id.js';
import {
  normalizeEmailAddress,
  redactSubscriberDestination,
  validateSubscriberUrl,
} from '../subscribers/urls.js';
import { buildActionControlRow } from '../watches/action-controls.js';

const VALID_SUBSCRIBER_MODES = new Set(['alert', 'aggregate_forward', 'quiet_summary']);

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
    metadata_json: JSON.stringify(input.metadata || {}),
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
  const mode = input.mode || 'alert';
  if (!VALID_SUBSCRIBER_MODES.has(mode)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_MODE',
      message: `Subscriber mode must be one of: ${Array.from(VALID_SUBSCRIBER_MODES).join(', ')}.`,
    };
  }
  const subscriberType = input.subscriber_type || 'webhook';
  const config = parseJsonField(input.config_json ?? input.config, {});
  const validation = validateSubscriberUrl(subscriberType, input.destination_url, config);
  if (!validation.ok) return validation;
  const destinationUrl = input.destination_url || validation.normalized_destination;
  const normalizedDestination =
    input.normalized_destination ||
    (subscriberType === 'email' ? normalizeEmailAddress(destinationUrl) : validation.normalized_destination || destinationUrl);
  const key = input.subscriber_key || `${input.channel_id}:${subscriberType}:${mode}:${normalizedDestination}`;
  const id = input.subscriber_id || stableId('sub', key);
  return {
    ok: true,
    row: {
      id,
      subscriber_id: id,
      workspace_id: input.workspace_id,
      channel_id: input.channel_id,
      subscriber_type: subscriberType,
      name: input.name || input.display_name || 'Webhook subscriber',
      destination_url: destinationUrl,
      normalized_destination: normalizedDestination,
      destination_url_redacted: redactSubscriberDestination(subscriberType, destinationUrl),
      secret_hash: null,
      mode,
      config_json: JSON.stringify(config),
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

function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeArrayField(value, fieldName) {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, status: 400, code: 'INVALID_CHANNEL_CONTRACT', message: `${fieldName} must be an array.` };
  }
  return { ok: true, value };
}

function normalizeObjectField(value, fieldName) {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, status: 400, code: 'INVALID_CHANNEL_CONTRACT', message: `${fieldName} must be an object.` };
  }
  return { ok: true, value };
}

function normalizeChannelMetadata(value) {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_CHANNEL_METADATA',
      message: 'metadata must be an object.',
    };
  }
  return { ok: true, value };
}

export function normalizeChannelContractInput(input = {}) {
  const expectedSignalTypes = normalizeArrayField(input.expected_signal_types, 'expected_signal_types');
  if (!expectedSignalTypes.ok) return expectedSignalTypes;
  const defaultDimensions = normalizeArrayField(input.default_dimensions, 'default_dimensions');
  if (!defaultDimensions.ok) return defaultDimensions;
  const defaultWatchTemplates = normalizeArrayField(input.default_watch_templates, 'default_watch_templates');
  if (!defaultWatchTemplates.ok) return defaultWatchTemplates;
  const ctaPolicy = normalizeObjectField(input.cta_policy, 'cta_policy');
  if (!ctaPolicy.ok) return ctaPolicy;

  for (const [index, template] of defaultWatchTemplates.value.entries()) {
    if (!template || typeof template !== 'object' || Array.isArray(template) || !template.watch_type) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_CHANNEL_CONTRACT',
        message: `default_watch_templates[${index}] must include a watch_type.`,
      };
    }
  }

  return {
    ok: true,
    contract: {
      purpose: input.purpose || null,
      expected_signal_types: expectedSignalTypes.value,
      default_dimensions: defaultDimensions.value,
      default_watch_templates: defaultWatchTemplates.value,
      cta_policy: ctaPolicy.value,
    },
  };
}

export function buildChannelContractRow(input, version, now = new Date().toISOString()) {
  const id = input.channel_contract_id || stableId('chct', `${input.channel_id}:${version}`);
  return {
    id,
    channel_contract_id: id,
    workspace_id: input.workspace_id,
    channel_id: input.channel_id,
    version,
    status: 'active',
    purpose: input.purpose || null,
    expected_signal_types_json: JSON.stringify(input.expected_signal_types || []),
    default_dimensions_json: JSON.stringify(input.default_dimensions || []),
    default_watch_templates_json: JSON.stringify(input.default_watch_templates || []),
    cta_policy_json: JSON.stringify(input.cta_policy || {}),
    source_app: input.source_app || null,
    external_tenant_id: input.external_tenant_id || null,
    external_user_id: input.external_user_id || null,
    created_at: now,
    updated_at: now,
  };
}

function publicChannelContract(row) {
  if (!row) return null;
  return {
    id: row.id,
    channel_contract_id: row.channel_contract_id,
    workspace_id: row.workspace_id,
    channel_id: row.channel_id,
    version: Number(row.version || 1),
    status: row.status,
    purpose: row.purpose || null,
    expected_signal_types: parseJsonField(row.expected_signal_types_json, []),
    default_dimensions: parseJsonField(row.default_dimensions_json, []),
    default_watch_templates: parseJsonField(row.default_watch_templates_json, []),
    cta_policy: parseJsonField(row.cta_policy_json, {}),
    source_app: row.source_app || null,
    external_tenant_id: row.external_tenant_id || null,
    external_user_id: row.external_user_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicChannel(row) {
  if (!row) return null;
  return {
    ...row,
    metadata: parseJsonField(row.metadata_json, {}),
  };
}

function publicSubscriber(row) {
  if (!row) return null;
  return {
    ...row,
    destination_url: undefined,
    destination_url_redacted:
      row.destination_url_redacted || redactSubscriberDestination(row.subscriber_type || 'webhook', row.destination_url),
    config: parseJsonField(row.config_json, {}),
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

async function allRows(db, sql, params = []) {
  if (typeof db.prepare !== 'function') return [];
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.all === 'function') {
    const result = await prepared.all();
    return result?.results || [];
  }
  return [];
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

async function loadSubscriber(db, subscriberId) {
  return firstRow(db, 'SELECT * FROM subscribers WHERE id = ? OR subscriber_id = ? LIMIT 1', [subscriberId, subscriberId]);
}

async function loadSignal(db, signalId) {
  return firstRow(db, 'SELECT * FROM signals WHERE id = ? OR signal_id = ? LIMIT 1', [signalId, signalId]);
}

async function loadWatch(db, watchId) {
  return firstRow(db, 'SELECT * FROM watches WHERE id = ? OR watch_id = ? LIMIT 1', [watchId, watchId]);
}

async function loadAlert(db, alertId) {
  return firstRow(db, 'SELECT * FROM alerts WHERE id = ? LIMIT 1', [alertId]);
}

async function loadActiveChannelContract(db, channelId) {
  return firstRow(
    db,
    'SELECT * FROM channel_contracts WHERE channel_id = ? AND status = ? ORDER BY version DESC LIMIT 1',
    [channelId, 'active'],
  );
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

async function requireAlertScope({ db, auth, workspaceId, channelId, alertId }) {
  const alert = await loadAlert(db, alertId);
  if (!alert) return { ok: false, status: 404, code: 'ALERT_NOT_FOUND', message: 'Alert was not found.' };
  if (alert.workspace_id !== workspaceId || alert.channel_id !== channelId) {
    return ownershipError('ALERT_SCOPE_MISMATCH', 'Alert does not belong to workspace and channel.');
  }
  if (tenantMismatch(auth, alert)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Alert is outside the authenticated tenant scope.');
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
  const normalizedMetadata = normalizeChannelMetadata(input.metadata);
  if (!normalizedMetadata.ok) return normalizedMetadata;
  const scopeDenied = await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id });
  if (scopeDenied) return scopeDenied;
  const workspace = await loadWorkspace(db, input.workspace_id);
  const row = buildChannelRow(inheritOwnership({ ...input, metadata: normalizedMetadata.value }, workspace), now);
  return { ok: true, channel: publicChannel(await insertRow(db, 'channels', row)) };
}

export async function getAdminChannel({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'channel:read');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const channel = await loadChannel(db, input.channel_id);
  if (!channel) return { ok: false, status: 404, code: 'CHANNEL_NOT_FOUND', message: 'Channel was not found.' };
  return { ok: true, channel: publicChannel(channel) };
}

export async function updateAdminChannel({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'channel:update');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const channel = await loadChannel(db, input.channel_id);
  if (!channel) return { ok: false, status: 404, code: 'CHANNEL_NOT_FOUND', message: 'Channel was not found.' };
  const normalizedMetadata = normalizeChannelMetadata(input.metadata);
  if (!normalizedMetadata.ok) return normalizedMetadata;
  const next = {
    name: input.name ?? channel.name,
    purpose: input.purpose ?? channel.purpose,
    metadata_json: input.metadata === undefined ? channel.metadata_json || '{}' : JSON.stringify(normalizedMetadata.value),
    updated_at: now,
    id: channel.id || channel.channel_id,
  };
  await db
    .prepare(
      `UPDATE channels
       SET name = ?, purpose = ?, metadata_json = ?, updated_at = ?
       WHERE id = ? OR channel_id = ?`,
    )
    .bind(next.name, next.purpose, next.metadata_json, next.updated_at, next.id, input.channel_id)
    .run();
  return {
    ok: true,
    channel: publicChannel({
      ...channel,
      name: next.name,
      purpose: next.purpose,
      metadata_json: next.metadata_json,
      updated_at: next.updated_at,
    }),
  };
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
  return { ok: true, subscriber: publicSubscriber(subscriber) };
}

async function resolveAdminSubscriber({ db, workspaceId, channelId, subscriberId, email, mode }) {
  if (subscriberId) {
    const subscriber = await loadSubscriber(db, subscriberId);
    if (!subscriber) {
      return { ok: false, status: 404, code: 'SUBSCRIBER_NOT_FOUND', message: 'Subscriber was not found.' };
    }
    if (subscriber.workspace_id !== workspaceId || subscriber.channel_id !== channelId) {
      return {
        ok: false,
        status: 404,
        code: 'SUBSCRIBER_SCOPE_MISMATCH',
        message: 'Subscriber does not belong to workspace and channel.',
      };
    }
    return { ok: true, subscriber };
  }

  const normalizedEmail = normalizeEmailAddress(email);
  if (!normalizedEmail) {
    return {
      ok: false,
      status: 400,
      code: 'SUBSCRIBER_LOOKUP_REQUIRED',
      message: 'Provide subscriber_id or email.',
    };
  }
  const params = [workspaceId, channelId, 'email', normalizedEmail];
  let sql = `SELECT *
             FROM subscribers
             WHERE workspace_id = ? AND channel_id = ? AND subscriber_type = ? AND normalized_destination = ?`;
  if (mode) {
    sql += ' AND mode = ?';
    params.push(mode);
  }
  const matches = await allRows(db, sql, params);
  if (matches.length === 0) {
    return { ok: false, status: 404, code: 'SUBSCRIBER_NOT_FOUND', message: 'Subscriber was not found.' };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      status: 409,
      code: 'AMBIGUOUS_SUBSCRIBER_MATCH',
      message: 'Multiple subscribers matched email lookup. Provide subscriber_id or mode.',
    };
  }
  return { ok: true, subscriber: matches[0] };
}

export async function disableAdminSubscriber({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'subscriber:update');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;

  const resolved = await resolveAdminSubscriber({
    db,
    workspaceId: input.workspace_id,
    channelId: input.channel_id,
    subscriberId: input.subscriber_id,
    email: input.email,
    mode: input.mode,
  });
  if (!resolved.ok) return resolved;

  const subscriber = resolved.subscriber;
  await db
    .prepare('UPDATE subscribers SET enabled = 0, updated_at = ? WHERE id = ? OR subscriber_id = ?')
    .bind(now, subscriber.id || subscriber.subscriber_id, subscriber.subscriber_id || subscriber.id)
    .run();

  return {
    ok: true,
    subscriber: publicSubscriber({ ...subscriber, enabled: 0, updated_at: now }),
    changed: subscriber.enabled === 0 ? false : true,
  };
}

export async function deleteAdminSubscriber({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'subscriber:delete');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;

  const resolved = await resolveAdminSubscriber({
    db,
    workspaceId: input.workspace_id,
    channelId: input.channel_id,
    subscriberId: input.subscriber_id,
    email: input.email,
    mode: input.mode,
  });
  if (!resolved.ok) return resolved;

  const subscriber = resolved.subscriber;
  await db
    .prepare('DELETE FROM subscribers WHERE id = ? OR subscriber_id = ?')
    .bind(subscriber.id || subscriber.subscriber_id, subscriber.subscriber_id || subscriber.id)
    .run();
  return { ok: true, deleted: true, subscriber: publicSubscriber(subscriber) };
}

export async function createAdminSignal({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'signal:create');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const activeChannelContract = await loadActiveChannelContract(db, input.channel_id);
  const inheritedContract = activeChannelContract ? publicChannelContract(activeChannelContract) : null;
  const signalContract = buildSignalContract(input.contract, inheritedContract);
  const row = buildSignalRow(input, now);
  await insertRow(db, 'signals', row);
  if (signalContract) {
    await insertRow(db, 'signal_contracts', {
      id: input.signal_contract_id || stableId('sigct', row.id),
      signal_contract_id: input.signal_contract_id || stableId('sigct', row.id),
      signal_id: row.id,
      contract_json: JSON.stringify(signalContract),
      created_at: now,
      updated_at: now,
    });
  }
  const materialized_watches =
    input.materialize_watch_templates === false
      ? []
      : await materializeWatchTemplates({ db, input, signal: row, channelContract: inheritedContract, now });
  return { ok: true, signal: row, signal_contract: signalContract, materialized_watches };
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

function buildSignalContract(explicitContract, channelContract) {
  if (explicitContract) {
    const inheritedDimensions = channelContract?.default_dimensions || [];
    return {
      ...explicitContract,
      dimensions: explicitContract.dimensions || inheritedDimensions,
      cta_policy: explicitContract.cta_policy || channelContract?.cta_policy,
    };
  }
  if (!channelContract) return null;
  return {
    dimensions: channelContract.default_dimensions || [],
    cta_policy: channelContract.cta_policy || {},
  };
}

async function materializeWatchTemplates({ db, input, signal, channelContract, now }) {
  const templates = channelContract?.default_watch_templates || [];
  const rows = [];
  for (const [index, template] of templates.entries()) {
    const watchInput = {
      workspace_id: input.workspace_id,
      channel_id: input.channel_id,
      signal_id: signal.id,
      name: template.name || `${signal.signal_key} ${template.watch_type}`,
      watch_type: template.watch_type,
      config: template.config || {},
      cooldown_seconds: template.cooldown_seconds,
      escalation: template.escalation,
      recovery: template.recovery,
      enabled: template.enabled,
      watch_id: template.watch_id || stableId('watch', `${signal.id}:template:${index}:${template.watch_type}`),
    };
    const row = buildWatchRow(watchInput, now);
    rows.push(await insertRow(db, 'watches', row));
  }
  return rows;
}

async function upsertChannelContractVersion({ db, input, channel, now }) {
  const normalized = normalizeChannelContractInput(input);
  if (!normalized.ok) return normalized;
  const active = await loadActiveChannelContract(db, input.channel_id);
  const version = active ? Number(active.version || 0) + 1 : 1;
  await db
    .prepare('UPDATE channel_contracts SET status = ?, updated_at = ? WHERE channel_id = ? AND status = ?')
    .bind('archived', now, input.channel_id, 'active')
    .run();
  const row = buildChannelContractRow(inheritOwnership({ ...input, ...normalized.contract }, channel), version, now);
  return { ok: true, channel_contract: publicChannelContract(await insertRow(db, 'channel_contracts', row)) };
}

export async function createAdminChannelContract({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'channel_contract:create');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const channel = await loadChannel(db, input.channel_id);
  return upsertChannelContractVersion({ db, input, channel, now });
}

export async function updateAdminChannelContract({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'channel_contract:update');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const channel = await loadChannel(db, input.channel_id);
  return upsertChannelContractVersion({ db, input, channel, now });
}

export async function getAdminChannelContract({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'channel_contract:read');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const row = input.channel_contract_id
    ? await firstRow(db, 'SELECT * FROM channel_contracts WHERE channel_contract_id = ? AND channel_id = ? LIMIT 1', [
        input.channel_contract_id,
        input.channel_id,
      ])
    : await loadActiveChannelContract(db, input.channel_id);
  if (!row) return { ok: false, status: 404, code: 'CHANNEL_CONTRACT_NOT_FOUND', message: 'Channel contract was not found.' };
  return { ok: true, channel_contract: publicChannelContract(row) };
}

export async function listAdminChannelContractVersions({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'channel_contract:read');
  if (denied) return denied;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const rows = await allRows(
    db,
    'SELECT * FROM channel_contracts WHERE channel_id = ? ORDER BY version DESC LIMIT ?',
    [input.channel_id, Math.min(Number(input.limit || 20), 100)],
  );
  return { ok: true, channel_contracts: rows.map(publicChannelContract) };
}

function publicActionControl(row) {
  return {
    id: row.id,
    action_id: row.action_id,
    workspace_id: row.workspace_id,
    channel_id: row.channel_id,
    target_type: row.target_type,
    target_id: row.target_id,
    action_type: row.action_type,
    status: row.status,
    reason: row.reason || null,
    expires_at: row.expires_at || null,
    actor_user_id: row.actor_user_id || null,
    source_app: row.source_app || null,
    external_tenant_id: row.external_tenant_id || null,
    external_user_id: row.external_user_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function targetFromActionInput(input) {
  if (input.watch_id) return { targetType: 'watch', targetId: input.watch_id };
  if (input.signal_id) return { targetType: 'signal', targetId: input.signal_id };
  if (input.alert_id) return { targetType: 'alert', targetId: input.alert_id };
  return { targetType: null, targetId: null };
}

async function requireActionTargetScope({ db, auth, input, targetType, targetId }) {
  if (targetType === 'watch') {
    return requireWatchScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id, watchId: targetId });
  }
  if (targetType === 'signal') {
    return requireSignalScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id, signalId: targetId });
  }
  if (targetType === 'alert') {
    return requireAlertScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id, alertId: targetId });
  }
  return { ok: false, status: 400, code: 'INVALID_ACTION_TARGET', message: 'Action target must include watch_id, signal_id, or alert_id.' };
}

async function createActionControl({ auth, db, input, actionType, now }) {
  const denied = denyIfNeeded(auth, 'watch:control');
  if (denied) return denied;
  const baseScope =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (baseScope) return baseScope;
  const { targetType, targetId } = targetFromActionInput(input);
  const targetScope = await requireActionTargetScope({ db, auth, input, targetType, targetId });
  if (targetScope) return targetScope;
  if (actionType === 'snooze' && !input.snooze_until && !input.expires_at) {
    return { ok: false, status: 400, code: 'SNOOZE_UNTIL_REQUIRED', message: 'snooze_until or expires_at is required.' };
  }
  const channel = await loadChannel(db, input.channel_id);
  const row = buildActionControlRow({
    input: inheritOwnership(input, channel),
    targetType,
    targetId,
    actionType,
    actorUserId: auth?.user_id || null,
    now,
  });
  await insertRow(db, 'watch_action_controls', row);
  if (actionType === 'ignore' && targetType === 'alert') {
    await db
      .prepare("UPDATE alert_deliveries SET status = ?, updated_at = ? WHERE alert_id = ? AND status IN ('pending', 'retrying')")
      .bind('ignored', now, targetId)
      .run();
  }
  return { ok: true, action_control: publicActionControl(row) };
}

export async function snoozeAdminWatch({ auth, db, input, now }) {
  return createActionControl({ auth, db, input, actionType: 'snooze', now });
}

export async function muteAdminWatch({ auth, db, input, now }) {
  return createActionControl({ auth, db, input, actionType: 'mute', now });
}

export async function ignoreAdminAlert({ auth, db, input, now }) {
  return createActionControl({ auth, db, input, actionType: 'ignore', now });
}

export async function resumeAdminWatch({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'watch:control');
  if (denied) return denied;
  const baseScope =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (baseScope) return baseScope;
  const { targetType, targetId } = targetFromActionInput(input);
  if (!['watch', 'signal'].includes(targetType)) {
    return { ok: false, status: 400, code: 'INVALID_RESUME_TARGET', message: 'Resume target must include watch_id or signal_id.' };
  }
  const targetScope = await requireActionTargetScope({ db, auth, input, targetType, targetId });
  if (targetScope) return targetScope;
  await db
    .prepare(
      `UPDATE watch_action_controls
       SET status = ?, updated_at = ?
       WHERE workspace_id = ? AND channel_id = ? AND target_type = ? AND target_id = ?
         AND action_type IN ('snooze', 'mute') AND status = 'active'`,
    )
    .bind('cleared', now, input.workspace_id, input.channel_id, targetType, targetId)
    .run();
  const channel = await loadChannel(db, input.channel_id);
  const row = buildActionControlRow({
    input: inheritOwnership(input, channel),
    targetType,
    targetId,
    actionType: 'resume',
    status: 'completed',
    actorUserId: auth?.user_id || null,
    now,
  });
  await insertRow(db, 'watch_action_controls', row);
  return { ok: true, action_control: publicActionControl(row) };
}
