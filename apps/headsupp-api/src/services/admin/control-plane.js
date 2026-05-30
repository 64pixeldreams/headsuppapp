import { hasPermission, requirePermission } from '../auth/permissions.js';
import { generateConnectorSecret, publicConnector } from '../connectors/secrets.js';
import { dispatchSubscriberLifecycleEvent } from '../delivery/subscriber-lifecycle.js';
import { stableId } from '../ids/stable-id.js';
import {
  normalizeEmailAddress,
  redactSubscriberDestination,
  validateSubscriberUrl,
} from '../subscribers/urls.js';
import { normalizeSubscriberConfigAlertFilters } from '../subscribers/alert-filters.js';
import { normalizeAuthorizationConfig, sendAuthorizationEmail } from '../subscribers/email-authorization.js';
import { buildActionControlRow } from '../watches/action-controls.js';

const VALID_SUBSCRIBER_MODES = new Set(['alert', 'aggregate_forward', 'quiet_summary', 'lifecycle']);
const VALID_WATCH_GROUP_WINNER_POLICIES = new Set(['highest_severity_wins', 'lowest_severity_wins']);
const WORKSPACE_SUBSCRIBER_SCOPE = 'workspace';
const CHANNEL_SUBSCRIBER_SCOPE = 'channel';
const WORKSPACE_SUBSCRIBER_CHANNEL_PREFIX = '__workspace__:';

function denyIfNeeded(auth, permission) {
  const allowed = requirePermission(auth, permission);
  return allowed.ok ? null : allowed;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validationError(action, field, message = `${field} is required.`) {
  return {
    ok: false,
    status: 400,
    code: 'VALIDATION_ERROR',
    message,
    details: { action, field },
  };
}

function requireString(input, field, action, { aliases = [] } = {}) {
  const value = cleanString(input?.[field]) || aliases.map((alias) => cleanString(input?.[alias])).find(Boolean);
  if (!value) return validationError(action, field);
  return { ok: true, value };
}

function scopedCreateDenied(auth, input, action) {
  if (auth?.source_app && input.source_app && auth.source_app !== input.source_app) {
    return {
      ok: false,
      status: 403,
      code: 'TENANT_SCOPE_MISMATCH',
      message: 'Requested source_app is outside the authenticated API key scope.',
      details: { action, field: 'source_app', expected: auth.source_app, received: input.source_app },
    };
  }
  if (auth?.external_tenant_id && input.external_tenant_id && auth.external_tenant_id !== input.external_tenant_id) {
    return {
      ok: false,
      status: 403,
      code: 'TENANT_SCOPE_MISMATCH',
      message: 'Requested external_tenant_id is outside the authenticated API key scope.',
      details: {
        action,
        field: 'external_tenant_id',
        expected: auth.external_tenant_id,
        received: input.external_tenant_id,
      },
    };
  }
  return null;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSubscriberScope(input = {}) {
  const scope = cleanString(input.subscriber_scope || input.scope) || CHANNEL_SUBSCRIBER_SCOPE;
  return scope === WORKSPACE_SUBSCRIBER_SCOPE ? WORKSPACE_SUBSCRIBER_SCOPE : CHANNEL_SUBSCRIBER_SCOPE;
}

function workspaceSubscriberChannelId(workspaceId) {
  return `${WORKSPACE_SUBSCRIBER_CHANNEL_PREFIX}${workspaceId}`;
}

export function buildWorkspaceRow(input, now = new Date().toISOString()) {
  const name = input.name || input.display_name;
  const workspaceKey = input.workspace_key || `${input.source_app || 'headsupp'}:${normalizeKey(name)}`;
  const id = input.workspace_id || stableId('ws', workspaceKey);
  return {
    id,
    workspace_id: id,
    workspace_key: workspaceKey,
    name,
    source_app: input.source_app || 'headsupp',
    external_tenant_id: input.external_tenant_id || id,
    external_user_id: input.external_user_id || null,
    status: input.status || 'active',
    created_at: now,
    updated_at: now,
  };
}

export function buildChannelRow(input, now = new Date().toISOString()) {
  const name = input.name || input.display_name;
  const channelKey = input.channel_key || `${input.workspace_id}:${normalizeKey(name)}`;
  const id = input.channel_id || stableId('ch', channelKey);
  return {
    id,
    channel_id: id,
    workspace_id: input.workspace_id,
    name,
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
  const subscriberScope = normalizeSubscriberScope(input);
  if (subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE && (subscriberType !== 'webhook' || mode !== 'alert')) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_SCOPE',
      message: 'Workspace-scoped subscribers currently support subscriber_type webhook with mode alert.',
    };
  }
  if (mode === 'lifecycle' && subscriberType !== 'webhook') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_MODE',
      message: 'Subscriber mode lifecycle is only supported for subscriber_type webhook.',
    };
  }
  const parsedConfig = parseJsonField(input.config_json ?? input.config, {});
  const filteredConfig = normalizeSubscriberConfigAlertFilters(parsedConfig);
  if (!filteredConfig.ok) return filteredConfig;
  const normalizedAuthConfig = subscriberType === 'email'
    ? normalizeAuthorizationConfig(filteredConfig.config, now)
    : { config: filteredConfig.config, required: false };
  const config = normalizedAuthConfig.config;
  const validation = validateSubscriberUrl(subscriberType, input.destination_url, config);
  if (!validation.ok) return validation;
  const destinationUrl = input.destination_url || validation.normalized_destination;
  const normalizedDestination =
    input.normalized_destination ||
    (subscriberType === 'email' ? normalizeEmailAddress(destinationUrl) : validation.normalized_destination || destinationUrl);
  const channelId = subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE ? workspaceSubscriberChannelId(input.workspace_id) : input.channel_id;
  const key =
    input.subscriber_key ||
    (subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE
      ? `${input.workspace_id}:${subscriberScope}:${subscriberType}:${mode}:${normalizedDestination}`
      : `${channelId}:${subscriberType}:${mode}:${normalizedDestination}`);
  const id = input.subscriber_id || stableId('sub', key);
  return {
    ok: true,
    row: {
      id,
      subscriber_id: id,
      workspace_id: input.workspace_id,
      channel_id: channelId,
      subscriber_type: subscriberType,
      name: input.name || input.display_name || 'Webhook subscriber',
      destination_url: destinationUrl,
      normalized_destination: normalizedDestination,
      destination_url_redacted: redactSubscriberDestination(subscriberType, destinationUrl),
      secret_hash: null,
      mode,
      config_json: JSON.stringify(config),
      enabled: normalizedAuthConfig.required ? 0 : input.enabled === false ? 0 : 1,
      subscriber_scope: subscriberScope,
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
    watch_group_id: input.watch_group_id || null,
    band_key: input.band_key || null,
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

export function buildWatchGroupRow(input, now = new Date().toISOString()) {
  const id = input.watch_group_id || stableId('wg', `${input.channel_id}:${input.signal_id}:${input.group_key}`);
  return {
    id,
    watch_group_id: id,
    workspace_id: input.workspace_id,
    channel_id: input.channel_id,
    signal_id: input.signal_id,
    group_key: input.group_key,
    name: input.name || input.group_key,
    winner_policy: input.winner_policy || 'highest_severity_wins',
    cooldown_scope: input.cooldown_scope || 'group',
    cooldown_seconds: Number(input.cooldown_seconds ?? 86400),
    recovery_json: input.recovery ? JSON.stringify(input.recovery) : null,
    config_json: JSON.stringify(input.config || {}),
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
  const scope = row.subscriber_scope || CHANNEL_SUBSCRIBER_SCOPE;
  return {
    ...row,
    subscriber_scope: scope,
    channel_id: scope === WORKSPACE_SUBSCRIBER_SCOPE ? null : row.channel_id,
    destination_url: undefined,
    destination_url_redacted:
      row.destination_url_redacted || redactSubscriberDestination(row.subscriber_type || 'webhook', row.destination_url),
    config: parseJsonField(row.config_json, {}),
  };
}

function sanitizeSubscriberConfig(config = {}) {
  const safe = {};
  for (const key of ['template_id', 'value_format', 'locale', 'actions', 'labels']) {
    if (config[key] !== undefined) safe[key] = config[key];
  }
  if (config.authorization && typeof config.authorization === 'object') {
    safe.authorization = {
      required: config.authorization.required === true,
      status: config.authorization.status || null,
      requested_at: config.authorization.requested_at || null,
      authorized_at: config.authorization.authorized_at || null,
    };
    if (config.authorization.ttl_seconds !== undefined) {
      safe.authorization.ttl_seconds = config.authorization.ttl_seconds;
    }
  }
  if (config.branding && typeof config.branding === 'object') {
    safe.branding = config.branding;
  }
  if (config.filters && typeof config.filters === 'object' && !Array.isArray(config.filters)) {
    safe.filters = config.filters;
  }
  return safe;
}

function publicSubscriberRead(row) {
  const subscriber = publicSubscriber(row);
  if (!subscriber) return null;
  return {
    subscriber_id: subscriber.subscriber_id || subscriber.id,
    subscriber_type: subscriber.subscriber_type,
    mode: subscriber.mode,
    enabled: subscriber.enabled,
    destination_url_redacted: subscriber.destination_url_redacted,
    normalized_destination: subscriber.subscriber_type === 'email' ? subscriber.normalized_destination : undefined,
    display_name: subscriber.name || subscriber.display_name || null,
    workspace_id: subscriber.workspace_id,
    channel_id: subscriber.channel_id,
    subscriber_scope: subscriber.subscriber_scope || CHANNEL_SUBSCRIBER_SCOPE,
    config: sanitizeSubscriberConfig(subscriber.config || {}),
    created_at: subscriber.created_at,
    updated_at: subscriber.updated_at,
  };
}

function denyUnlessSubscriberRead(auth) {
  if (hasPermission(auth, 'subscriber:read')) return null;
  // Existing integration keys may only include subscriber:update until rotated.
  if (hasPermission(auth, 'subscriber:update')) return null;
  return requirePermission(auth, 'subscriber:read');
}

function denyUnlessWatchUpdate(auth) {
  if (hasPermission(auth, 'watch:update')) return null;
  // Existing integration keys that can create or control watches may update them
  // before they are rotated to include the new watch:update permission.
  if (hasPermission(auth, 'watch:create') || hasPermission(auth, 'watch:control')) return null;
  return requirePermission(auth, 'watch:update');
}

async function insertRow(db, table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  await db
    .prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`)
    .bind(...columns.map((column) => (row[column] === undefined ? null : row[column])))
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

async function loadWatchGroup(db, watchGroupId) {
  return firstRow(db, 'SELECT * FROM watch_groups WHERE id = ? OR watch_group_id = ? LIMIT 1', [watchGroupId, watchGroupId]);
}

async function findWatchGroupByChannelKey(db, channelId, groupKey) {
  if (!channelId || !groupKey) return null;
  return firstRow(db, 'SELECT * FROM watch_groups WHERE channel_id = ? AND group_key = ? LIMIT 1', [channelId, groupKey]);
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

function notFound(code, message) {
  return { ok: false, status: 404, code, message };
}

async function findWorkspaceByKey(db, workspaceKey) {
  if (!workspaceKey) return null;
  return firstRow(db, 'SELECT * FROM workspaces WHERE workspace_key = ? LIMIT 1', [workspaceKey]);
}

async function findChannelByKey(db, channelKey) {
  if (!channelKey) return null;
  return firstRow(db, 'SELECT * FROM channels WHERE channel_key = ? LIMIT 1', [channelKey]);
}

async function findConnectorByKey(db, connectorKey) {
  if (!connectorKey) return null;
  return firstRow(db, 'SELECT * FROM connectors WHERE connector_key = ? LIMIT 1', [connectorKey]);
}

async function findSignalByChannelKey(db, channelId, signalKey) {
  if (!channelId || !signalKey) return null;
  return firstRow(db, 'SELECT * FROM signals WHERE channel_id = ? AND signal_key = ? LIMIT 1', [channelId, signalKey]);
}

async function findSubscriberByDestination({
  db,
  workspaceId,
  channelId,
  subscriberScope,
  subscriberType,
  mode,
  normalizedDestination,
}) {
  if (!workspaceId || !subscriberType || !normalizedDestination) return null;
  const params = [workspaceId, subscriberType, mode || 'alert', subscriberScope];
  let sql = `SELECT *
             FROM subscribers
             WHERE workspace_id = ?
               AND subscriber_type = ?
               AND mode = ?
               AND COALESCE(subscriber_scope, 'channel') = ?`;
  if (subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE) {
    sql += ' AND channel_id = ?';
    params.push(workspaceSubscriberChannelId(workspaceId));
  } else {
    sql += ' AND channel_id = ?';
    params.push(channelId);
  }
  let matches = await allRows(db, sql, params);
  matches = matches.filter((row) => {
    const normalizedStored = normalizeEmailAddress(row.normalized_destination || row.destination_url || '');
    return normalizedStored === normalizedDestination;
  });
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const aAuthorized = parseJsonField(a.config_json, {}).authorization?.status === 'authorized' ? 1 : 0;
    const bAuthorized = parseJsonField(b.config_json, {}).authorization?.status === 'authorized' ? 1 : 0;
    if (aAuthorized !== bAuthorized) return bAuthorized - aAuthorized;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });
  return matches[0];
}

async function reconcileDuplicateEmailSubscribers({
  db,
  canonicalSubscriber,
  workspaceId,
  channelId,
  subscriberScope,
  mode,
  normalizedDestination,
  authorizationConfig,
  now,
}) {
  if (!canonicalSubscriber || !normalizedDestination) return;
  const params = [workspaceId, 'email', mode || 'alert', subscriberScope];
  let sql = `SELECT *
             FROM subscribers
             WHERE workspace_id = ?
               AND subscriber_type = ?
               AND mode = ?
               AND COALESCE(subscriber_scope, 'channel') = ?`;
  if (subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE) {
    sql += ' AND channel_id = ?';
    params.push(workspaceSubscriberChannelId(workspaceId));
  } else {
    sql += ' AND channel_id = ?';
    params.push(channelId);
  }

  const rows = await allRows(db, sql, params);
  const canonicalId = canonicalSubscriber.id || canonicalSubscriber.subscriber_id;
  const canonicalSubscriberId = canonicalSubscriber.subscriber_id || canonicalSubscriber.id;
  for (const row of rows) {
    const rowId = row.id || row.subscriber_id;
    const rowSubscriberId = row.subscriber_id || row.id;
    if (rowId === canonicalId || rowSubscriberId === canonicalSubscriberId) continue;
    const normalizedStored = normalizeEmailAddress(row.normalized_destination || row.destination_url || '');
    if (normalizedStored !== normalizedDestination) continue;

    const config = parseJsonField(row.config_json, {});
    const nextAuthorization = {
      ...(config.authorization || {}),
      ...(authorizationConfig || {}),
      status: authorizationConfig?.status || config.authorization?.status || 'authorized',
      authorized_at: authorizationConfig?.authorized_at || config.authorization?.authorized_at || now,
    };
    const nextConfig = {
      ...config,
      authorization: nextAuthorization,
    };
    await db
      .prepare(
        `UPDATE subscribers
         SET enabled = 0, normalized_destination = ?, config_json = ?, updated_at = ?
         WHERE id = ? OR subscriber_id = ?`,
      )
      .bind(normalizedDestination, JSON.stringify(nextConfig), now, rowId, rowSubscriberId)
      .run();
  }
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
  const action = 'admin.createWorkspace';
  const name = requireString(input, 'name', action, { aliases: ['display_name'] });
  if (!name.ok) return name;
  for (const field of ['source_app', 'external_tenant_id', 'external_user_id']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  const scopeDenied = scopedCreateDenied(auth, input, action);
  if (scopeDenied) return scopeDenied;
  const row = buildWorkspaceRow(input, now);
  const existing = await findWorkspaceByKey(db, row.workspace_key);
  if (existing) return { ok: true, created: false, workspace: existing };
  await insertRow(db, 'workspaces', row);
  return { ok: true, created: true, workspace: (await loadWorkspace(db, row.workspace_id)) || row };
}

export async function createAdminChannel({ auth, db, input, now }) {
  const denied = denyIfNeeded(auth, 'channel:create');
  if (denied) return denied;
  const action = 'admin.createChannel';
  for (const field of ['workspace_id']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  const name = requireString(input, 'name', action, { aliases: ['display_name'] });
  if (!name.ok) return name;
  const scopeDeniedForInput = scopedCreateDenied(auth, input, action);
  if (scopeDeniedForInput) return scopeDeniedForInput;
  const normalizedMetadata = normalizeChannelMetadata(input.metadata);
  if (!normalizedMetadata.ok) return normalizedMetadata;
  const scopeDenied = await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id });
  if (scopeDenied) return scopeDenied;
  const workspace = await loadWorkspace(db, input.workspace_id);
  if (!workspace) return notFound('WORKSPACE_NOT_FOUND', 'Workspace was not found.');
  const row = buildChannelRow(inheritOwnership({ ...input, metadata: normalizedMetadata.value }, workspace), now);
  const existing = await findChannelByKey(db, row.channel_key);
  if (existing) return { ok: true, created: false, channel: publicChannel(existing) };
  await insertRow(db, 'channels', row);
  return { ok: true, created: true, channel: publicChannel((await loadChannel(db, row.channel_id)) || row) };
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
  const action = 'admin.createConnector';
  for (const field of ['workspace_id', 'channel_id']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  const scopeDeniedForInput = scopedCreateDenied(auth, input, action);
  if (scopeDeniedForInput) return scopeDeniedForInput;
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const channel = await loadChannel(db, input.channel_id);
  if (!channel) return notFound('CHANNEL_NOT_FOUND', 'Channel was not found.');
  const row = buildConnectorRow(inheritOwnership(input, channel), now, secretFactory);
  const existing = await findConnectorByKey(db, row.connector_key);
  if (existing) return { ok: true, created: false, connector: publicConnector(existing, { includeSecret: false }), secret_returned: false };
  await insertRow(db, 'connectors', row);
  const stored = (await findConnectorByKey(db, row.connector_key)) || row;
  if (store) await store.put('connector_by_key', stored.connector_key, stored);
  return { ok: true, created: true, connector: publicConnector(stored, { includeSecret: true }), secret_returned: true };
}

export async function createAdminSubscriber({ auth, db, input, env = {}, now }) {
  const denied = denyIfNeeded(auth, 'subscriber:create');
  if (denied) return denied;
  const action = 'admin.createSubscriber';
  const subscriberScope = normalizeSubscriberScope(input);
  for (const field of ['workspace_id', 'subscriber_type', 'destination_url']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  if (subscriberScope === CHANNEL_SUBSCRIBER_SCOPE) {
    const required = requireString(input, 'channel_id', action);
    if (!required.ok) return required;
  }
  const scopeDeniedForInput = scopedCreateDenied(auth, input, action);
  if (scopeDeniedForInput) return scopeDeniedForInput;
  const scopeDenied = subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE
    ? await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })
    : (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
      (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;
  const parent = subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE
    ? await loadWorkspace(db, input.workspace_id)
    : await loadChannel(db, input.channel_id);
  if (!parent) {
    return subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE
      ? notFound('WORKSPACE_NOT_FOUND', 'Workspace was not found.')
      : notFound('CHANNEL_NOT_FOUND', 'Channel was not found.');
  }
  const built = buildSubscriberRow(inheritOwnership({ ...input, subscriber_scope: subscriberScope }, parent), now);
  if (!built.ok) return built;
  const exactExisting = await loadSubscriber(db, built.row.subscriber_id);
  let destinationExisting = null;
  if (input.upsert_existing === true && built.row.subscriber_type === 'email') {
    destinationExisting = await findSubscriberByDestination({
      db,
      workspaceId: built.row.workspace_id,
      channelId: built.row.channel_id,
      subscriberScope,
      subscriberType: built.row.subscriber_type,
      mode: built.row.mode,
      normalizedDestination: built.row.normalized_destination,
    });
  }
  const exactConfig = parseJsonField(exactExisting?.config_json, {});
  const destinationConfig = parseJsonField(destinationExisting?.config_json, {});
  const existing =
    destinationConfig.authorization?.status === 'authorized' &&
    exactConfig.authorization?.status !== 'authorized'
      ? destinationExisting
      : exactExisting || destinationExisting;
  if (existing) {
    if (input.upsert_existing === true) {
      const existingNormalizedDestination = existing.subscriber_type === 'email'
        ? normalizeEmailAddress(existing.normalized_destination || existing.destination_url || '')
        : existing.normalized_destination;
      if (existing.subscriber_type === 'email' && existingNormalizedDestination !== built.row.normalized_destination) {
        return validationError(
          action,
          'destination_url',
          'Existing email subscribers cannot change destination_url under the same subscriber_key.',
        );
      }
      const existingConfig = parseJsonField(existing.config_json, {});
      const nextConfig = parseJsonField(built.row.config_json, {});
      if (
        existing.subscriber_type === 'email' &&
        existingConfig.authorization?.status === 'authorized' &&
        nextConfig.authorization?.required === true &&
        !input.config?.authorization?.status
      ) {
        nextConfig.authorization = {
          ...nextConfig.authorization,
          status: 'authorized',
          requested_at: existingConfig.authorization.requested_at || nextConfig.authorization.requested_at || now,
          authorized_at: existingConfig.authorization.authorized_at || now,
        };
      }
      if (existing.subscriber_type === 'email' && nextConfig.authorization?.status === 'authorized') {
        await reconcileDuplicateEmailSubscribers({
          db,
          canonicalSubscriber: existing,
          workspaceId: built.row.workspace_id,
          channelId: built.row.channel_id,
          subscriberScope,
          mode: built.row.mode,
          normalizedDestination: built.row.normalized_destination,
          authorizationConfig: nextConfig.authorization,
          now,
        });
      }
      const nextEnabled = existing.subscriber_type === 'email' && nextConfig.authorization?.status === 'authorized'
        ? existing.enabled
        : built.row.enabled;
      const unchanged =
        existing.name === built.row.name &&
        existing.destination_url === built.row.destination_url &&
        existingNormalizedDestination === built.row.normalized_destination &&
        JSON.stringify(existingConfig) === JSON.stringify(nextConfig) &&
        Number(existing.enabled) === Number(nextEnabled) &&
        (existing.external_resource_id || null) === (built.row.external_resource_id || null);
      if (unchanged) {
        return { ok: true, created: false, subscriber: publicSubscriber(existing), authorization: null };
      }
      await db
        .prepare(
          `UPDATE subscribers
           SET name = ?, destination_url = ?, normalized_destination = ?, destination_url_redacted = ?,
               config_json = ?, enabled = ?, source_app = ?, external_tenant_id = ?, external_user_id = ?,
               external_resource_id = ?, updated_at = ?
           WHERE id = ? OR subscriber_id = ?`,
        )
        .bind(
          built.row.name,
          built.row.destination_url,
          built.row.normalized_destination,
          built.row.destination_url_redacted,
          JSON.stringify(nextConfig),
          nextEnabled,
          built.row.source_app,
          built.row.external_tenant_id,
          built.row.external_user_id,
          built.row.external_resource_id,
          now,
          existing.id || existing.subscriber_id,
          existing.subscriber_id || existing.id,
        )
        .run();
      return {
        ok: true,
        created: false,
        updated: true,
        subscriber: publicSubscriber({
          ...existing,
          name: built.row.name,
          destination_url: built.row.destination_url,
          normalized_destination: built.row.normalized_destination,
          destination_url_redacted: built.row.destination_url_redacted,
          config_json: JSON.stringify(nextConfig),
          enabled: nextEnabled,
          source_app: built.row.source_app,
          external_tenant_id: built.row.external_tenant_id,
          external_user_id: built.row.external_user_id,
          external_resource_id: built.row.external_resource_id,
          updated_at: now,
        }),
        authorization: null,
      };
    }
    return { ok: true, created: false, subscriber: publicSubscriber(existing), authorization: null };
  }
  await insertRow(db, 'subscribers', built.row);
  const subscriber = (await loadSubscriber(db, built.row.subscriber_id)) || built.row;
  let authorization = null;
  if (subscriber.subscriber_type === 'email') {
    const config = parseJsonField(subscriber.config_json, {});
    if (config.authorization?.required === true && config.authorization?.status === 'pending') {
      authorization = await sendAuthorizationEmail({ env, subscriber, now });
    }
  }
  return { ok: true, created: true, subscriber: publicSubscriber(subscriber), authorization };
}

async function resolveAdminSubscriber({ db, workspaceId, channelId, subscriberScope = CHANNEL_SUBSCRIBER_SCOPE, subscriberId, email, mode }) {
  if (subscriberId) {
    const subscriber = await loadSubscriber(db, subscriberId);
    if (!subscriber) {
      return { ok: false, status: 404, code: 'SUBSCRIBER_NOT_FOUND', message: 'Subscriber was not found.' };
    }
    const storedScope = subscriber.subscriber_scope || CHANNEL_SUBSCRIBER_SCOPE;
    const channelMismatch = channelId && subscriber.channel_id !== channelId;
    if (subscriber.workspace_id !== workspaceId || storedScope !== subscriberScope || channelMismatch) {
      return {
        ok: false,
        status: 404,
        code: 'SUBSCRIBER_SCOPE_MISMATCH',
        message: 'Subscriber does not belong to the requested subscriber scope.',
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

export async function disableAdminSubscriber({ auth, db, env, input, now }) {
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

  const changed = subscriber.enabled !== 0;
  if (changed) {
    await dispatchSubscriberLifecycleEvent({
      db,
      env,
      event: 'subscriber.disabled',
      subscriber: { ...subscriber, enabled: 0, updated_at: now },
      now,
    }).catch(() => {});
  }

  return {
    ok: true,
    subscriber: publicSubscriber({ ...subscriber, enabled: 0, updated_at: now }),
    changed,
  };
}

export async function deleteAdminSubscriber({ auth, db, env, input, now }) {
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
  await dispatchSubscriberLifecycleEvent({
    db,
    env,
    event: 'subscriber.deleted',
    subscriber,
    now,
  }).catch(() => {});

  await db
    .prepare('DELETE FROM subscribers WHERE id = ? OR subscriber_id = ?')
    .bind(subscriber.id || subscriber.subscriber_id, subscriber.subscriber_id || subscriber.id)
    .run();
  return { ok: true, deleted: true, subscriber: publicSubscriber(subscriber) };
}

export async function getAdminSubscriber({ auth, db, input }) {
  const denied = denyUnlessSubscriberRead(auth);
  if (denied) return denied;
  const action = 'admin.getSubscriber';
  const subscriberScope = normalizeSubscriberScope(input);
  for (const field of ['workspace_id']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  if (subscriberScope === CHANNEL_SUBSCRIBER_SCOPE) {
    const required = requireString(input, 'channel_id', action);
    if (!required.ok) return required;
  }
  if (!cleanString(input.subscriber_id) && !cleanString(input.email)) {
    return validationError(action, 'subscriber_id', 'Provide subscriber_id or email.');
  }
  const scopeDenied = subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE
    ? await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })
    : (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
      (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;

  const resolved = await resolveAdminSubscriber({
    db,
    workspaceId: input.workspace_id,
    channelId: input.channel_id,
    subscriberScope,
    subscriberId: input.subscriber_id,
    email: input.email,
    mode: input.mode,
  });
  if (!resolved.ok) return resolved;
  if (tenantMismatch(auth, resolved.subscriber)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Subscriber is outside the authenticated tenant scope.');
  }
  return { ok: true, subscriber: publicSubscriberRead(resolved.subscriber) };
}

export async function listAdminSubscribers({ auth, db, input }) {
  const denied = denyUnlessSubscriberRead(auth);
  if (denied) return denied;
  const action = 'admin.listSubscribers';
  const subscriberScope = normalizeSubscriberScope(input);
  for (const field of ['workspace_id']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  if (subscriberScope === CHANNEL_SUBSCRIBER_SCOPE) {
    const required = requireString(input, 'channel_id', action);
    if (!required.ok) return required;
  }
  const scopeDenied = subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE
    ? await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })
    : (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
      (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
  if (scopeDenied) return scopeDenied;

  const params =
    subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE
      ? [input.workspace_id, WORKSPACE_SUBSCRIBER_SCOPE]
      : [input.workspace_id, input.channel_id, CHANNEL_SUBSCRIBER_SCOPE];
  let sql =
    subscriberScope === WORKSPACE_SUBSCRIBER_SCOPE
      ? 'SELECT * FROM subscribers WHERE workspace_id = ? AND subscriber_scope = ?'
      : "SELECT * FROM subscribers WHERE workspace_id = ? AND channel_id = ? AND COALESCE(subscriber_scope, 'channel') = ?";
  if (cleanString(input.subscriber_type)) {
    sql += ' AND subscriber_type = ?';
    params.push(cleanString(input.subscriber_type));
  }
  if (cleanString(input.mode)) {
    sql += ' AND mode = ?';
    params.push(cleanString(input.mode));
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(Math.max(Number(input.limit || 50), 1), 100));

  const rows = await allRows(db, sql, params);
  const subscribers = rows
    .filter((row) => !tenantMismatch(auth, row))
    .map((row) => publicSubscriberRead(row));
  return { ok: true, subscribers };
}

export async function createAdminSignal({
  auth,
  db,
  input,
  now,
  skip_scope_validation = false,
  inherited_channel_contract = null,
}) {
  const denied = denyIfNeeded(auth, 'signal:create');
  if (denied) return denied;
  const action = 'admin.createSignal';
  for (const field of ['workspace_id', 'channel_id', 'signal_key']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  const scopeDeniedForInput = scopedCreateDenied(auth, input, action);
  if (scopeDeniedForInput) return scopeDeniedForInput;
  if (!skip_scope_validation) {
    const scopeDenied =
      (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
      (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }));
    if (scopeDenied) return scopeDenied;
    const channel = await loadChannel(db, input.channel_id);
    if (!channel) return notFound('CHANNEL_NOT_FOUND', 'Channel was not found.');
  }
  const inheritedContract = inherited_channel_contract
    || (skip_scope_validation
      ? null
      : publicChannelContract(await loadActiveChannelContract(db, input.channel_id)));
  const signalContract = buildSignalContract(input.contract, inheritedContract);
  const row = buildSignalRow(input, now);
  const existing = await findSignalByChannelKey(db, row.channel_id, row.signal_key);
  if (existing) return { ok: true, created: false, signal: existing, signal_contract: signalContract, materialized_watches: [] };
  await insertRow(db, 'signals', row);
  const storedSignal = (await loadSignal(db, row.signal_id)) || row;
  if (signalContract) {
    await insertRow(db, 'signal_contracts', {
      id: input.signal_contract_id || stableId('sigct', storedSignal.id || storedSignal.signal_id),
      signal_contract_id: input.signal_contract_id || stableId('sigct', storedSignal.id || storedSignal.signal_id),
      signal_id: storedSignal.id || storedSignal.signal_id,
      contract_json: JSON.stringify(signalContract),
      created_at: now,
      updated_at: now,
    });
  }
  const materialized_watches =
    input.materialize_watch_templates === false
      ? []
      : await materializeWatchTemplates({ db, input, signal: storedSignal, channelContract: inheritedContract, now });
  return { ok: true, created: true, signal: storedSignal, signal_contract: signalContract, materialized_watches };
}

export async function createAdminWatch({ auth, db, input, now, skip_scope_validation = false }) {
  const denied = denyIfNeeded(auth, 'watch:create');
  if (denied) return denied;
  const action = 'admin.createWatch';
  for (const field of ['workspace_id', 'channel_id', 'signal_id', 'name', 'watch_type']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  const scopeDeniedForInput = scopedCreateDenied(auth, input, action);
  if (scopeDeniedForInput) return scopeDeniedForInput;
  if (input.config !== undefined && (typeof input.config !== 'object' || Array.isArray(input.config) || input.config === null)) {
    return validationError(action, 'config', 'config must be an object when provided.');
  }
  if (!skip_scope_validation) {
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
  }
  const row = buildWatchRow(input, now);
  const existing = await loadWatch(db, row.watch_id);
  if (existing) return { ok: true, created: false, watch: existing };
  await insertRow(db, 'watches', row);
  return { ok: true, created: true, watch: (await loadWatch(db, row.watch_id)) || row };
}

export async function updateAdminWatch({ auth, db, input, now }) {
  const denied = denyUnlessWatchUpdate(auth);
  if (denied) return denied;
  const action = 'admin.updateWatch';
  for (const field of ['workspace_id', 'channel_id', 'watch_id']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  if (input.config !== undefined && (typeof input.config !== 'object' || Array.isArray(input.config) || input.config === null)) {
    return validationError(action, 'config', 'config must be an object when provided.');
  }
  const scopeDenied =
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id })) ||
    (await requireWatchScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id, watchId: input.watch_id }));
  if (scopeDenied) return scopeDenied;
  const watch = await loadWatch(db, input.watch_id);
  if (!watch) return { ok: false, status: 404, code: 'WATCH_NOT_FOUND', message: 'Watch was not found.' };

  const next = {
    name: input.name ?? watch.name,
    enabled: input.enabled === undefined ? watch.enabled : input.enabled === false ? 0 : 1,
    cooldown_seconds: input.cooldown_seconds === undefined ? watch.cooldown_seconds : Number(input.cooldown_seconds),
    config_json: input.config === undefined ? watch.config_json : JSON.stringify(input.config),
    escalation_json: input.escalation === undefined ? watch.escalation_json : input.escalation ? JSON.stringify(input.escalation) : null,
    recovery_json: input.recovery === undefined ? watch.recovery_json : input.recovery ? JSON.stringify(input.recovery) : null,
    updated_at: now,
  };
  await db
    .prepare(
      `UPDATE watches
       SET name = ?, enabled = ?, cooldown_seconds = ?, config_json = ?, escalation_json = ?, recovery_json = ?, updated_at = ?
       WHERE id = ? OR watch_id = ?`,
    )
    .bind(
      next.name,
      next.enabled,
      next.cooldown_seconds,
      next.config_json,
      next.escalation_json,
      next.recovery_json,
      next.updated_at,
      watch.id || watch.watch_id,
      watch.watch_id || watch.id,
    )
    .run();

  const updated = (await loadWatch(db, watch.id || watch.watch_id)) || { ...watch, ...next };
  return { ok: true, watch: updated, changed: Number(watch.enabled) !== Number(next.enabled) };
}

export async function createAdminWatchGroup({ auth, db, input, now, skip_scope_validation = false }) {
  const denied = denyIfNeeded(auth, 'watch:create');
  if (denied) return denied;
  const action = 'admin.createWatchGroup';
  for (const field of ['workspace_id', 'channel_id', 'signal_id', 'group_key']) {
    const required = requireString(input, field, action);
    if (!required.ok) return required;
  }
  const winnerPolicy = input.winner_policy || 'highest_severity_wins';
  if (!VALID_WATCH_GROUP_WINNER_POLICIES.has(winnerPolicy)) {
    return validationError(action, 'winner_policy', 'winner_policy must be highest_severity_wins or lowest_severity_wins.');
  }
  const cooldownScope = input.cooldown_scope || 'group';
  if (cooldownScope !== 'group') {
    return validationError(action, 'cooldown_scope', 'cooldown_scope must be group.');
  }
  const scopeDeniedForInput = scopedCreateDenied(auth, input, action);
  if (scopeDeniedForInput) return scopeDeniedForInput;
  if (!skip_scope_validation) {
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
  }
  const row = buildWatchGroupRow({ ...input, winner_policy: winnerPolicy, cooldown_scope: cooldownScope }, now);
  const existing = await findWatchGroupByChannelKey(db, row.channel_id, row.group_key);
  if (existing) return { ok: true, created: false, watch_group: existing };
  await insertRow(db, 'watch_groups', row);
  return { ok: true, created: true, watch_group: (await loadWatchGroup(db, row.watch_group_id)) || row };
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
