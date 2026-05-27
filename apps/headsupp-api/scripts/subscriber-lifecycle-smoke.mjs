import { createEmailAuthorizationToken } from '../src/services/subscribers/email-authorization.js';
import { postFunction } from './smoke/admin-api.mjs';
import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { checkHealth } from './smoke/events.mjs';
import { cleanupGenericScenario, genericSmokeIds } from './smoke/generic-provisioning.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('subscriber_lifecycle');
const startedAt = new Date().toISOString();
const now = new Date().toISOString();
const lifecycleWebhookUrl =
  process.env.HEADSUPP_SMOKE_WEBHOOK_URL || process.env.HEADSUPP_SMOKE_RETRY_SUCCESS_URL || 'https://httpbin.org/post';
const emailAddress = `smoke+${ids.scenarioId}@example.com`;
const emailAuthSecret = String(process.env.HEADSUPP_EMAIL_AUTH_SECRET || '').trim();

const health = await checkHealth(runtime.baseUrl);
await cleanupGenericScenario(client, ids);

await client.d1Query(
  `INSERT INTO workspaces (
    id, workspace_id, workspace_key, name, source_app, external_tenant_id, external_user_id, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    ids.workspace,
    ids.workspace,
    `headsupp:${ids.scenarioId}`,
    `Smoke ${ids.scenarioId} Workspace`,
    'headsupp-smoke',
    ids.scenarioId,
    `${ids.scenarioId}-user`,
    'active',
    now,
    now,
  ],
);

await client.d1Query(
  `INSERT INTO channels (
    id, channel_id, workspace_id, name, channel_key, purpose, status, source_app,
    external_tenant_id, external_user_id, external_resource_id, metadata_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    ids.channel,
    ids.channel,
    ids.workspace,
    `Smoke ${ids.scenarioId} Channel`,
    `headsupp:${ids.scenarioId}:channel`,
    'Subscriber lifecycle smoke channel',
    'active',
    'headsupp-smoke',
    ids.scenarioId,
    `${ids.scenarioId}-user`,
    `${ids.scenarioId}-resource`,
    JSON.stringify({ forecast_id: `${ids.scenarioId}_forecast` }),
    now,
    now,
  ],
);

const emailSubscriberId = `${ids.subscriber}_email`;
const lifecycleSubscriberId = `${ids.webhookSubscriber}_lifecycle`;

await client.d1Query(
  `INSERT INTO subscribers (
    id, subscriber_id, workspace_id, channel_id, subscriber_type, name, destination_url, normalized_destination,
    destination_url_redacted, secret_hash, mode, config_json, enabled, source_app,
    external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    emailSubscriberId,
    emailSubscriberId,
    ids.workspace,
    ids.channel,
    'email',
    emailAddress,
    emailAddress,
    emailAddress,
    `${emailAddress.slice(0, 2)}***@example.com`,
    null,
    'alert',
    JSON.stringify({
      authorization: {
        required: true,
        status: 'pending',
        requested_at: now,
      },
    }),
    0,
    'headsupp-smoke',
    ids.scenarioId,
    `${ids.scenarioId}-user`,
    `${ids.scenarioId}-resource`,
    now,
    now,
  ],
);

await client.d1Query(
  `INSERT INTO subscribers (
    id, subscriber_id, workspace_id, channel_id, subscriber_type, name, destination_url, normalized_destination,
    destination_url_redacted, secret_hash, mode, config_json, enabled, source_app,
    external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    lifecycleSubscriberId,
    lifecycleSubscriberId,
    ids.workspace,
    ids.channel,
    'webhook',
    'Lifecycle callback',
    lifecycleWebhookUrl,
    lifecycleWebhookUrl,
    'https://httpbin.org/post',
    null,
    'lifecycle',
    JSON.stringify({ signing_secret: 'smoke-lifecycle-secret' }),
    1,
    'headsupp-smoke',
    ids.scenarioId,
    `${ids.scenarioId}-user`,
    `${ids.scenarioId}-resource`,
    now,
    now,
  ],
);

async function readViaApi(action, payload) {
  if (!runtime.serviceApiKey) return null;
  return postFunction({
    baseUrl: runtime.baseUrl,
    apiKey: runtime.serviceApiKey,
    action,
    payload,
  });
}

const apiReads = {};
if (!runtime.serviceApiKey) {
  apiReads.skipped = 'Set HEADSUPP_SMOKE_SERVICE_API_KEY or HEADSUPP_API_KEY to exercise admin.getSubscriber and admin.listSubscribers.';
} else {
  const pending = await readViaApi('admin.getSubscriber', {
    workspace_id: ids.workspace,
    channel_id: ids.channel,
    subscriber_id: emailSubscriberId,
  });
  if (!pending?.subscriber) throw new Error(`admin.getSubscriber did not return subscriber: ${JSON.stringify(pending)}`);
  if (pending.subscriber.enabled !== 0) {
    throw new Error(`Expected pending email subscriber enabled=0, got ${pending.subscriber.enabled}`);
  }
  if (pending.subscriber.config?.authorization?.status !== 'pending') {
    throw new Error(`Expected authorization.status=pending, got ${pending.subscriber.config?.authorization?.status}`);
  }
  if (pending.subscriber.destination_url) {
    throw new Error('admin.getSubscriber leaked destination_url.');
  }

  const listed = await readViaApi('admin.listSubscribers', {
    workspace_id: ids.workspace,
    channel_id: ids.channel,
  });
  if (!Array.isArray(listed?.subscribers) || listed.subscribers.length < 2) {
    throw new Error(`admin.listSubscribers expected at least 2 subscribers: ${JSON.stringify(listed)}`);
  }
  apiReads.pending = {
    enabled: pending.subscriber.enabled,
    authorization_status: pending.subscriber.config.authorization.status,
    subscriber_count: listed.subscribers.length,
  };
}

const lifecycleProof = {
  confirm_path_exercised: false,
  confirm_code: null,
  lifecycle_webhook_target: lifecycleWebhookUrl.replace(/\/[^/]+$/, '/...'),
};

if (emailAuthSecret) {
  const token = await createEmailAuthorizationToken({
    env: { HEADSUPP_EMAIL_AUTH_SECRET: emailAuthSecret },
    subscriberId: emailSubscriberId,
    workspaceId: ids.workspace,
    channelId: ids.channel,
    now,
  });
  const confirmResponse = await fetch(`${runtime.baseUrl}/v1/subscribers/confirm?token=${encodeURIComponent(token)}`);
  lifecycleProof.confirm_path_exercised = true;
  lifecycleProof.confirm_status = confirmResponse.status;
  if (!confirmResponse.ok) {
    throw new Error(`Email confirmation endpoint failed ${confirmResponse.status}`);
  }

  if (runtime.serviceApiKey) {
    const authorized = await readViaApi('admin.getSubscriber', {
      workspace_id: ids.workspace,
      channel_id: ids.channel,
      subscriber_id: emailSubscriberId,
    });
    if (authorized.subscriber.enabled !== 1) {
      throw new Error(`Expected authorized subscriber enabled=1, got ${authorized.subscriber.enabled}`);
    }
    if (authorized.subscriber.config?.authorization?.status !== 'authorized') {
      throw new Error(`Expected authorization.status=authorized, got ${authorized.subscriber.config?.authorization?.status}`);
    }
    apiReads.authorized = {
      enabled: authorized.subscriber.enabled,
      authorization_status: authorized.subscriber.config.authorization.status,
    };

    const disabled = await readViaApi('admin.disableSubscriber', {
      workspace_id: ids.workspace,
      channel_id: ids.channel,
      subscriber_id: emailSubscriberId,
    });
    if (disabled.subscriber.enabled !== 0) {
      throw new Error(`Expected disabled subscriber enabled=0, got ${disabled.subscriber.enabled}`);
    }
    apiReads.disabled = { enabled: disabled.subscriber.enabled, changed: disabled.changed };
  }
} else {
  lifecycleProof.confirm_skipped =
    'Set HEADSUPP_EMAIL_AUTH_SECRET to exercise GET /v1/subscribers/confirm and lifecycle webhook dispatch on deployed Worker.';
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      workspace_id: ids.workspace,
      channel_id: ids.channel,
      email_subscriber_id: emailSubscriberId,
      lifecycle_subscriber_id: lifecycleSubscriberId,
      api_reads: apiReads,
      lifecycle_proof: lifecycleProof,
      health: {
        status: health.status,
        app: health.app,
      },
    },
    null,
    2,
  ),
);
