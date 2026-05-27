import {
  createAdminChannel,
  createAdminChannelContract,
  createAdminConnector,
  createAdminSignal,
  createAdminSubscriber,
  createAdminWatch,
  createAdminWorkspace,
  deleteAdminSubscriber,
  disableAdminSubscriber,
  getAdminChannel,
  getAdminChannelContract,
  ignoreAdminAlert,
  listAdminChannelContractVersions,
  muteAdminWatch,
  resumeAdminWatch,
  snoozeAdminWatch,
  updateAdminChannel,
  updateAdminChannelContract,
} from '../services/admin/control-plane.js';
import { getAdminWatchState, listAdminAlertTimeline, listAdminChannelAlerts } from '../services/admin/read-models.js';
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
      details: result.details || null,
    },
  };
}

function schemaMismatchResponse(error) {
  const message = String(error?.message || '');
  const tableMatch = message.match(/no such table: ([\w_]+)/i);
  const columnMatch = message.match(/table ([\w_]+) has no column named ([\w_]+)/i);
  const missingColumnMatch = message.match(/no such column: ([\w_]+)/i);
  if (!tableMatch && !columnMatch && !missingColumnMatch) return null;

  return resultToResponse({
    ok: false,
    status: 503,
    code: 'SCHEMA_MISMATCH',
    message: 'Heads Up database schema is not compatible with the deployed API. Run the latest D1 migrations.',
    details: {
      table: tableMatch?.[1] || columnMatch?.[1] || null,
      column: columnMatch?.[2] || missingColumnMatch?.[1] || null,
      original_message: message,
    },
  });
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
    ['channel_contract', 'channel_contract'],
    ['action_control', 'watch_action_control'],
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
        try {
          const result = await handler({ auth, input, db: env.DB, env, store, now: new Date().toISOString() });
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
        } catch (error) {
          const schemaResponse = schemaMismatchResponse(error);
          if (schemaResponse) return schemaResponse;
          throw error;
        }
      },
      { auth: true },
    );
  };

  defineAdmin('admin.createWorkspace', createAdminWorkspace);
  defineAdmin('admin.createChannel', createAdminChannel);
  defineAdmin('admin.getChannel', getAdminChannel);
  defineAdmin('admin.updateChannel', updateAdminChannel);
  defineAdmin('admin.createConnector', createAdminConnector);
  defineAdmin('admin.createSubscriber', createAdminSubscriber);
  defineAdmin('admin.disableSubscriber', disableAdminSubscriber);
  defineAdmin('admin.deleteSubscriber', deleteAdminSubscriber);
  defineAdmin('admin.createSignal', createAdminSignal);
  defineAdmin('admin.createWatch', createAdminWatch);
  defineAdmin('admin.createChannelContract', createAdminChannelContract);
  defineAdmin('admin.updateChannelContract', updateAdminChannelContract);
  defineAdmin('admin.getChannelContract', getAdminChannelContract);
  defineAdmin('admin.listChannelContractVersions', listAdminChannelContractVersions);
  defineAdmin('admin.listChannelAlerts', listAdminChannelAlerts);
  defineAdmin('admin.getWatchState', getAdminWatchState);
  defineAdmin('admin.listAlertTimeline', listAdminAlertTimeline);
  defineAdmin('admin.snoozeWatch', snoozeAdminWatch);
  defineAdmin('admin.muteWatch', muteAdminWatch);
  defineAdmin('admin.resumeWatch', resumeAdminWatch);
  defineAdmin('admin.ignoreAlert', ignoreAdminAlert);
}
