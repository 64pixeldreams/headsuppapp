import { sanitizeAuthContext } from '../services/auth/permissions.js';
import { registerAdminFunctions } from './admin-functions.js';
import { registerForeticFunctions } from './foretic-functions.js';

export async function registerHeadsuppFunctions(cloudFunction) {
  await registerAdminFunctions(cloudFunction);
  await registerForeticFunctions(cloudFunction);

  cloudFunction.define(
    'headsupp.health',
    async () => ({
      status: 'ok',
      app: 'headsupp_app',
      framework: 'CFKit',
      timestamp: new Date().toISOString(),
    }),
    {
      auth: false,
    },
  );

  cloudFunction.define(
    'headsupp.version',
    async () => ({
      app: 'headsupp_app',
      version: '0.1.0',
      role: 'attention-processing-api',
    }),
    {
      auth: false,
    },
  );

  cloudFunction.define(
    'headsupp.authContext',
    async ({ auth }) => ({
      auth: sanitizeAuthContext(auth),
    }),
    {
      auth: true,
    },
  );
}
