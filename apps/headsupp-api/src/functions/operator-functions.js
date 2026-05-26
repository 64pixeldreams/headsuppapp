import {
  createServiceApiKey,
  listServiceApiKeys,
  normalizeBootstrapToken,
  revokeServiceApiKey,
  rotateServiceApiKey,
} from '../services/auth/api-key-service.js';

function readBootstrapTokenFromRequest(request) {
  if (!request?.headers) return null;
  if (typeof request.headers.get === 'function') {
    return normalizeBootstrapToken(request.headers.get('X-HeadsUp-Bootstrap-Token'));
  }
  const headers = request.headers;
  return normalizeBootstrapToken(
    headers['X-HeadsUp-Bootstrap-Token'] || headers['x-headsupp-bootstrap-token'],
  );
}
import { listAuditLogs, writeAuditLog } from '../services/audit/control-plane-audit.js';
import { requirePermission } from '../services/auth/permissions.js';

function resultToResponse(result) {
  if (result.ok) return { success: true, data: result };
  return {
    success: false,
    error: {
      code: result.code,
      message: result.message,
      status: result.status,
    },
  };
}

function requireDb(env) {
  if (!env.DB) {
    return {
      ok: false,
      status: 501,
      code: 'DB_NOT_CONFIGURED',
      message: 'DB binding is required for operator functions.',
    };
  }
  return null;
}

async function audited({ db, action, auth, input, requestId, handler }) {
  const result = await handler();
  await writeAuditLog({
    db,
    action,
    auth,
    input,
    requestId,
    success: Boolean(result.ok),
    errorCode: result.ok ? null : result.code,
    targetType: result.key ? 'api_key' : null,
    targetId: result.key?.key_id || null,
  });
  return result;
}

export async function registerOperatorFunctions(cloudFunction) {
  cloudFunction.define(
    'operator.bootstrapServiceApiKey',
    async ({ payload, env, request, requestId }) => {
      const missingDb = requireDb(env);
      if (missingDb) return resultToResponse(missingDb);
      const result = await audited({
        db: env.DB,
        action: 'operator.bootstrapServiceApiKey',
        auth: null,
        input: payload || {},
        requestId,
        handler: () =>
          createServiceApiKey({
            env,
            input: payload || {},
            bootstrapToken: normalizeBootstrapToken(env.HEADSUPP_BOOTSTRAP_TOKEN),
            providedBootstrapToken: readBootstrapTokenFromRequest(request),
          }),
      });
      return resultToResponse(result);
    },
    { auth: false },
  );

  const defineKeyAction = (action, handler) => {
    cloudFunction.define(
      action,
      async ({ auth, payload, env, requestId }) => {
        const missingDb = requireDb(env);
        if (missingDb) return resultToResponse(missingDb);
        const result = await audited({
          db: env.DB,
          action,
          auth,
          input: payload || {},
          requestId,
          handler: () => handler({ env, auth, input: payload || {} }),
        });
        return resultToResponse(result);
      },
      { auth: true },
    );
  };

  defineKeyAction('operator.listServiceApiKeys', listServiceApiKeys);
  defineKeyAction('operator.revokeServiceApiKey', revokeServiceApiKey);
  defineKeyAction('operator.rotateServiceApiKey', rotateServiceApiKey);

  cloudFunction.define(
    'operator.listAuditLogs',
    async ({ auth, payload, env }) => {
      const denied = requirePermission(auth, 'audit:read');
      if (!denied.ok) return resultToResponse(denied);
      const missingDb = requireDb(env);
      if (missingDb) return resultToResponse(missingDb);
      return resultToResponse({
        ok: true,
        audit_logs: await listAuditLogs({ db: env.DB, limit: payload?.limit }),
      });
    },
    { auth: true },
  );
}
