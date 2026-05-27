export const PERMISSION_PROFILES = Object.freeze({
  'headsupp:operator': Object.freeze(['api_key:manage', 'audit:read']),
  'headsupp:admin': Object.freeze([
    'workspace:create',
    'channel:create',
    'channel:read',
    'channel:update',
    'connector:create',
    'subscriber:create',
    'subscriber:read',
    'subscriber:update',
    'subscriber:delete',
    'signal:create',
    'watch:create',
    'channel_contract:create',
    'channel_contract:update',
    'channel_contract:read',
    'alert:read',
    'watch:read',
    'watch:control',
  ]),
  'foretic:provisioner': Object.freeze(['foretic:provision']),
  'foretic:runtime': Object.freeze([
    'workspace:create',
    'channel:create',
    'channel:read',
    'channel:update',
    'connector:create',
    'subscriber:create',
    'subscriber:read',
    'subscriber:update',
    'subscriber:delete',
    'signal:create',
    'watch:create',
    'alert:read',
    'watch:read',
    'watch:control',
  ]),
});

export const FORETIC_SERVICE_PERMISSIONS = Object.freeze([...PERMISSION_PROFILES['foretic:provisioner']]);

export function getPermissions(auth) {
  if (!auth || !Array.isArray(auth.permissions)) return [];
  return auth.permissions.filter((permission) => typeof permission === 'string' && permission.trim());
}

export function hasPermission(auth, permission) {
  if (!permission) return false;
  const permissions = getPermissions(auth);
  return permissions.includes(permission) || permissions.includes('*');
}

export function requirePermission(auth, permission) {
  if (!auth?.user_id) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Authentication is required.',
    };
  }

  if (!hasPermission(auth, permission)) {
    return {
      ok: false,
      status: 403,
      code: 'PERMISSION_DENIED',
      message: `Permission '${permission}' is required.`,
    };
  }

  return {
    ok: true,
    user_id: auth.user_id,
    permission,
  };
}

export function requireForeticProvision(auth) {
  return requirePermission(auth, 'foretic:provision');
}

export function sanitizeAuthContext(auth) {
  if (!auth) return null;

  return {
    type: auth.type || 'unknown',
    user_id: auth.user_id || null,
    email: auth.email || null,
    permissions: getPermissions(auth),
    has_foretic_provision: hasPermission(auth, 'foretic:provision'),
  };
}
