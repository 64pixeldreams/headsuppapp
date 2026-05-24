import {
  createAdminChannel,
  createAdminConnector,
  createAdminSignal,
  createAdminSubscriber,
  createAdminWatch,
  createAdminWorkspace,
} from '../services/admin/control-plane.js';

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

export async function registerAdminFunctions(cloudFunction) {
  const defineAdmin = (action, handler) => {
    cloudFunction.define(
      action,
      async ({ auth, payload, env }) => {
        const missingDb = requireDb(env);
        if (missingDb) return resultToResponse(missingDb);
        return resultToResponse(await handler({ auth, input: payload || {}, db: env.DB }));
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
