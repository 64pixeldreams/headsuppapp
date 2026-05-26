import { postFunction } from './smoke/admin-api.mjs';
import { smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();

if (!runtime.bootstrapToken) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: 'BOOTSTRAP_TOKEN_MISSING',
        message: 'HEADSUPP_BOOTSTRAP_TOKEN is not set.',
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

try {
  const userId = `service:bootstrap-verify:${Date.now()}`;
  const created = await postFunction({
    baseUrl: runtime.baseUrl,
    bootstrapToken: runtime.bootstrapToken,
    action: 'operator.bootstrapServiceApiKey',
    payload: {
      name: 'Bootstrap auth verify',
      user_id: userId,
      source_app: 'headsupp-ci',
      external_tenant_id: 'bootstrap-verify',
      permissions: ['api_key:manage'],
    },
  });

  if (!created.api_key || !created.key?.key_id) {
    throw new Error('Bootstrap verify did not return one-time API key material.');
  }

  await postFunction({
    baseUrl: runtime.baseUrl,
    apiKey: created.api_key,
    action: 'operator.revokeServiceApiKey',
    payload: {
      user_id: userId,
      key_id: created.key.key_id,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        base_url: runtime.baseUrl,
        message: 'Bootstrap token matches deployed Worker HEADSUPP_BOOTSTRAP_TOKEN.',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        base_url: runtime.baseUrl,
        message: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
