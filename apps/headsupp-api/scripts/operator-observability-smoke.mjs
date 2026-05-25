import { postFunction, getObservabilityOverview } from './smoke/admin-api.mjs';
import { checkHealth } from './smoke/events.mjs';
import { redactSecret, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('HEADSUPP_BOOTSTRAP_TOKEN', runtime.bootstrapToken);
requireEnv('HEADSUPP_OPERATOR_TOKEN', runtime.operatorToken);

const startedAt = new Date().toISOString();
const health = await checkHealth(runtime.baseUrl);
const userId = `service:operator-smoke:${Date.now()}`;

const created = await postFunction({
  baseUrl: runtime.baseUrl,
  bootstrapToken: runtime.bootstrapToken,
  action: 'operator.bootstrapServiceApiKey',
  payload: {
    name: 'Operator observability smoke key',
    user_id: userId,
    source_app: 'headsupp-smoke',
    external_tenant_id: 'operator-observability',
    permissions: ['api_key:manage', 'audit:read', 'workspace:create', 'channel:create', 'watch:control', 'alert:read', 'watch:read'],
  },
});

if (!created.api_key || !created.key?.key_id) {
  throw new Error(`Bootstrap did not return one-time API key: ${JSON.stringify(created)}`);
}

const listed = await postFunction({
  baseUrl: runtime.baseUrl,
  apiKey: created.api_key,
  action: 'operator.listServiceApiKeys',
  payload: { user_id: userId },
});

if (JSON.stringify(listed).includes(created.api_key)) {
  throw new Error('List service API keys leaked raw API key material.');
}

const rotated = await postFunction({
  baseUrl: runtime.baseUrl,
  apiKey: created.api_key,
  action: 'operator.rotateServiceApiKey',
  payload: {
    user_id: userId,
    key_id: created.key.key_id,
    name: 'Operator observability smoke key rotated',
    permissions: created.key.permissions,
  },
});

const audit = await postFunction({
  baseUrl: runtime.baseUrl,
  apiKey: rotated.api_key,
  action: 'operator.listAuditLogs',
  payload: { limit: 20 },
});

const overview = await getObservabilityOverview({
  baseUrl: runtime.baseUrl,
  operatorToken: runtime.operatorToken,
});

const revoked = await postFunction({
  baseUrl: runtime.baseUrl,
  apiKey: rotated.api_key,
  action: 'operator.revokeServiceApiKey',
  payload: {
    user_id: userId,
    key_id: rotated.key.key_id,
  },
});

const serializedSafeResponses = JSON.stringify({ listed, audit, overview, revoked });
for (const secret of [created.api_key, rotated.api_key]) {
  if (secret && serializedSafeResponses.includes(secret)) {
    throw new Error('Operator/observability response leaked raw API key material.');
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      health: { status: health.status, app: health.app },
      key_lifecycle: {
        created_key_id: created.key.key_id,
        created_api_key_preview: redactSecret(created.api_key),
        listed_count: listed.keys?.length || 0,
        rotated_key_id: rotated.key.key_id,
        revoked_status: revoked.key?.status,
      },
      audit: {
        rows: audit.audit_logs?.length || 0,
      },
      observability: {
        keys: Object.keys(overview || {}),
      },
      assertions: {
        raw_key_returned_once_on_create: Boolean(created.api_key),
        raw_key_not_returned_by_list: !JSON.stringify(listed).includes(created.api_key),
        raw_key_not_returned_by_safe_reads: true,
      },
    },
    null,
    2,
  ),
);
