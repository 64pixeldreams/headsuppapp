import { createKVControlPlaneStore } from '../services/control-plane/kv-store.js';
import { createForeticForecastWatch } from '../services/foretic/create-forecast-watch.js';
import { provisionForeticWorkspace } from '../services/foretic/provision-workspace.js';

function resultToResponse(result) {
  if (result.ok) {
    return {
      success: true,
      data: result,
    };
  }

  return {
    success: false,
    error: {
      code: result.code,
      message: result.message,
      status: result.status,
    },
  };
}

export async function registerForeticFunctions(cloudFunction) {
  cloudFunction.define(
    'foretic.provisionWorkspace',
    async ({ auth, payload, env }) => {
      const store = createKVControlPlaneStore(env.HEADSUPP_CACHE);
      const result = await provisionForeticWorkspace({
        auth,
        input: payload,
        store,
        db: env.DB,
      });

      return resultToResponse(result);
    },
    {
      auth: true,
      validation: {
        external_tenant_id: { type: 'string' },
        external_user_id: { type: 'string' },
        user_id: { type: 'string' },
        name: { type: 'string' },
      },
    },
  );

  cloudFunction.define(
    'foretic.createForecastWatch',
    async ({ auth, payload, env, request }) => {
      const store = createKVControlPlaneStore(env.HEADSUPP_CACHE);
      const url = request ? new URL(request.url) : null;
      const result = await createForeticForecastWatch({
        auth,
        input: payload,
        store,
        db: env.DB,
        baseUrl: env.HEADSUPP_PUBLIC_URL || url?.origin || 'https://headsupp_app.example.workers.dev',
      });

      return resultToResponse(result);
    },
    {
      auth: true,
      validation: {
        external_tenant_id: { type: 'string' },
        external_user_id: { type: 'string' },
        user_id: { type: 'string' },
        forecast_id: { type: 'string' },
        forecast_name: { type: 'string' },
        slack_webhook_url: { type: 'string' },
        foretic_callback_url: { type: 'string' },
      },
    },
  );
}
