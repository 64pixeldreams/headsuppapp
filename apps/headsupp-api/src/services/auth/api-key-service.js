import { Datastore } from '../../../../../cfkit/src/modules/datastore/index.js';
import { generateApiKey, hashApiKey } from '../../../../../cfkit/src/modules/auth/utils/api-keys.js';
import { hasPermission, requirePermission } from './permissions.js';

export const SERVICE_KEY_PERMISSIONS = Object.freeze([
  'workspace:create',
  'channel:create',
  'connector:create',
  'subscriber:create',
  'subscriber:update',
  'signal:create',
  'watch:create',
]);

const OPERATOR_PERMISSIONS = Object.freeze(['operator:bootstrap', 'api_key:manage', '*']);

function datastoreFor(env, userId = null) {
  const store = new Datastore(env);
  return userId ? store.auth(userId) : store;
}

function nowIso(now = new Date().toISOString()) {
  return typeof now === 'string' ? now : now.toISOString();
}

function normalizePermissions(permissions = SERVICE_KEY_PERMISSIONS) {
  return [...new Set((Array.isArray(permissions) ? permissions : []).filter((permission) => typeof permission === 'string' && permission.trim()))];
}

export function hasOperatorBootstrapAuth(auth, bootstrapToken, providedToken) {
  if (auth && OPERATOR_PERMISSIONS.some((permission) => hasPermission(auth, permission))) return true;
  return Boolean(bootstrapToken && providedToken && bootstrapToken === providedToken);
}

export function safeApiKeyMetadata(keyHash, keyData = {}) {
  return {
    key_id: keyData.key_id || keyHash,
    key_hash: keyHash,
    name: keyData.name,
    user_id: keyData.user_id,
    status: keyData.status || (keyData.active === false ? 'revoked' : 'active'),
    active: keyData.active !== false,
    permissions: normalizePermissions(keyData.permissions),
    source_app: keyData.source_app || null,
    external_tenant_id: keyData.external_tenant_id || null,
    external_user_id: keyData.external_user_id || null,
    created_at: keyData.created_at || keyData.created,
    last_used_at: keyData.last_used_at || keyData.last_used || null,
    revoked_at: keyData.revoked_at || keyData.revoked || null,
    rotated_from_key_id: keyData.rotated_from_key_id || null,
    usage: keyData.usage || { requests_today: 0, requests_total: 0 },
    key_preview: `${String(keyHash).slice(0, 8)}...`,
  };
}

export async function createServiceApiKey({
  env,
  auth = null,
  input = {},
  now = new Date().toISOString(),
  apiKeyFactory = generateApiKey,
  bootstrapToken = null,
  providedBootstrapToken = null,
  rotatedFromKeyId = null,
} = {}) {
  if (!hasOperatorBootstrapAuth(auth, bootstrapToken, providedBootstrapToken)) {
    return {
      ok: false,
      status: 403,
      code: 'BOOTSTRAP_AUTH_REQUIRED',
      message: 'Operator bootstrap authorization is required.',
    };
  }

  const rawKey = apiKeyFactory();
  const keyHash = await hashApiKey(rawKey);
  const timestamp = nowIso(now);
  const userId = input.user_id || input.owner_id || auth?.user_id || 'service:headsupp-operator';
  const keyData = {
    key_id: keyHash,
    user_id: userId,
    name: input.name || 'Heads Up service key',
    created: timestamp,
    created_at: timestamp,
    last_used: null,
    last_used_at: null,
    active: true,
    status: 'active',
    source_app: input.source_app || null,
    external_tenant_id: input.external_tenant_id || null,
    external_user_id: input.external_user_id || null,
    permissions: normalizePermissions(input.permissions?.length ? input.permissions : SERVICE_KEY_PERMISSIONS),
    rate_limit: input.rate_limit || { requests: 1000, window: 3600 },
    usage: { requests_today: 0, requests_total: 0 },
    rotated_from_key_id: rotatedFromKeyId,
  };

  const store = datastoreFor(env, userId);
  await store.put('APIKEY', keyHash, keyData);
  await store.queryListAddItem('apikeys', userId, keyHash);

  return {
    ok: true,
    api_key: rawKey,
    key: safeApiKeyMetadata(keyHash, keyData),
    message: 'Save this API key securely. It will not be shown again.',
  };
}

export async function listServiceApiKeys({ env, auth, input = {} }) {
  const denied = requirePermission(auth, 'api_key:manage');
  if (denied.ok === false && !hasPermission(auth, '*')) return denied;

  const userId = input.user_id || auth.user_id;
  const store = datastoreFor(env, userId);
  const keyHashes = await store.queryListByPointer('apikeys', userId);
  const keys = [];
  for (const keyHash of keyHashes || []) {
    const data = await store.get('APIKEY', keyHash);
    if (data) keys.push(safeApiKeyMetadata(keyHash, data));
  }
  return { ok: true, keys };
}

export async function revokeServiceApiKey({ env, auth, input = {}, now = new Date().toISOString() }) {
  const denied = requirePermission(auth, 'api_key:manage');
  if (denied.ok === false && !hasPermission(auth, '*')) return denied;
  const keyHash = input.key_hash || input.key_id;
  if (!keyHash) return { ok: false, status: 400, code: 'MISSING_KEY_ID', message: 'key_id or key_hash is required.' };

  const userId = input.user_id || auth.user_id;
  const store = datastoreFor(env, userId);
  const data = await store.get('APIKEY', keyHash);
  if (!data) return { ok: false, status: 404, code: 'API_KEY_NOT_FOUND', message: 'API key not found.' };

  const timestamp = nowIso(now);
  const updated = {
    ...data,
    active: false,
    status: 'revoked',
    revoked: timestamp,
    revoked_at: timestamp,
  };
  await store.put('APIKEY', keyHash, updated);
  return { ok: true, key: safeApiKeyMetadata(keyHash, updated) };
}

export async function rotateServiceApiKey({
  env,
  auth,
  input = {},
  now = new Date().toISOString(),
  apiKeyFactory = generateApiKey,
} = {}) {
  const revokeResult = await revokeServiceApiKey({ env, auth, input, now });
  if (!revokeResult.ok) return revokeResult;
  return createServiceApiKey({
    env,
    auth,
    input: {
      user_id: input.user_id || revokeResult.key.user_id,
      name: input.name || `${revokeResult.key.name || 'service key'} rotated`,
      permissions: input.permissions || revokeResult.key.permissions,
      rate_limit: input.rate_limit,
    },
    now,
    apiKeyFactory,
    rotatedFromKeyId: revokeResult.key.key_id,
  });
}
