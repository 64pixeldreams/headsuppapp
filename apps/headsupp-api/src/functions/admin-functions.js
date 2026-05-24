import {
  createAdminChannel,
  createAdminConnector,
  createAdminSignal,
  createAdminSubscriber,
  createAdminWatch,
  createAdminWorkspace,
} from '../services/admin/control-plane.js';
import { createKVControlPlaneStore } from '../services/control-plane/kv-store.js';
import { writeAuditLog } from '../services/audit/control-plane-audit.js';

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
      message: 'DB binding is required for admin functions.',
    };
  }
  return null;
}

function targetFromResult(result) {
  const pairs = [
    ['workspace', 'workspace'],
    ['channel', 'channel'],
    ['connector', 'connector'],
    ['subscriber', 'subscriber'],
    ['signal', 'signal'],
    ['watch', 'watch'],
  ];
  for (const [key, type] of pairs) {
    if (result?.[key]) return { targetType: type, targetId: result[key].id || result[key][`${key}_id`] };
  }
  return { targetType: null, targetId: null };
}

export async function registerAdminFunctions(cloudFunction) {
  const defineAdmin = (action, handler) => {
    cloudFunction.define(
      action,
      async ({ auth, payload, env, requestId }) => {
        const missingDb = requireDb(env);
        if (missingDb) return resultToResponse(missingDb);
        const input = payload || {};
        const store = env.HEADSUPP_CACHE ? createKVControlPlaneStore(env.HEADSUPP_CACHE) : null;
        const result = await handler({ auth, input, db: env.DB, store });
        const target = targetFromResult(result);
        await writeAuditLog({
          db: env.DB,
          action,
          auth,
          input,
          success: Boolean(result.ok),
          errorCode: result.ok ? null : result.code,
          requestId,
          ...target,
        });
        return resultToResponse(result);
      },
      { auth: true },
    );
  };

  defineAdmin('admin.createWorkspace', createAdminWorkspace);
  defineAdmin('admin.createChannel', createAdminChannel);
  defineAdmin('admin.createConnector', createAdminConnector);
  defineAdmin('admin.createSubscriber', createAdminSubscriber);
  defineAdmin('admin.createSignal', createAdminSignal);
  defineAdmin('admin.createWatch', createAdminWatch);
}
