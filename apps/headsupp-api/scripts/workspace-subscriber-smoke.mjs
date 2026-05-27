import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import { cleanupGenericScenario, genericSmokeIds } from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_SERVICE_API_KEY or HEADSUPP_API_KEY', runtime.serviceApiKey);

const client = createCloudflareClient(runtime);
const firstIds = genericSmokeIds('workspace_subscriber_a');
const secondIds = genericSmokeIds('workspace_subscriber_b');
const workspaceId = firstIds.workspace;
const signalKey = 'demo.workspace.metric';
const runId = `workspace-subscriber:${Date.now()}`;

async function callFunction(action, payload) {
  const response = await fetch(`${runtime.baseUrl}/api/function`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runtime.serviceApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, payload }),
  });
  const body = await response.json();
  if (!body.success) {
    throw new Error(`${action} failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

function provisionPayload(ids, { includeWorkspace = false } = {}) {
  return {
    ...(includeWorkspace
      ? {
          workspace: {
            workspace_id: workspaceId,
            workspace_key: `headsupp:${firstIds.scenarioId}:workspace`,
            name: 'Smoke workspace subscriber Workspace',
            source_app: 'headsupp-smoke',
            external_tenant_id: 'workspace-subscriber',
            external_user_id: 'workspace-subscriber-user',
          },
        }
      : { workspace_id: workspaceId }),
    channel: {
      channel_id: ids.channel,
      channel_key: `headsupp:${ids.scenarioId}:channel`,
      name: `Smoke ${ids.scenarioId} Channel`,
      purpose: 'Workspace subscriber smoke',
    },
    connector: {
      connector_id: ids.connector,
      connector_key: ids.connectorKey,
    },
    signals: [
      {
        signal_id: ids.signal,
        signal_key: signalKey,
      },
    ],
    watches: [
      {
        watch_id: ids.watch,
        signal_key: signalKey,
        name: 'Workspace subscriber metric high',
        watch_type: 'LAST_VALUE_GT',
        config: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
        cooldown_seconds: 1,
      },
    ],
    workspace_subscribers: [
      {
        subscriber_type: 'webhook',
        destination_url: 'https://example.com/heads-up/workspace-callback',
        name: 'Workspace alert callback',
        mode: 'alert',
      },
    ],
  };
}

async function trigger(ids, setup, suffix) {
  await sendSignedEvents({
    baseUrl: runtime.baseUrl,
    connectorKey: setup.connector.connector_key,
    connectorSecret: setup.connector.connector_secret,
    events: [
      buildMetricEvent({
        runId,
        name: suffix,
        signalKey,
        value: 12,
        source: 'workspace-subscriber-smoke',
      }),
    ],
  });
}

async function workspaceDeliveryCount(subscriberId) {
  const row = await client.d1First(
    `SELECT COUNT(*) AS count
     FROM alert_deliveries
     WHERE subscriber_id = ?`,
    [subscriberId],
  );
  return Number(row?.count || 0);
}

await cleanupGenericScenario(client, firstIds);
await cleanupGenericScenario(client, secondIds);
await client.d1Query('DELETE FROM subscribers WHERE workspace_id = ?', [workspaceId]);
const health = await checkHealth(runtime.baseUrl);

const firstSetup = await callFunction('admin.provisionChannel', provisionPayload(firstIds, { includeWorkspace: true }));
const secondSetup = await callFunction('admin.provisionChannel', provisionPayload(secondIds));
const workspaceSubscriber = firstSetup.workspace_subscribers[0];

await trigger(firstIds, firstSetup, 'trigger-a');
await trigger(secondIds, secondSetup, 'trigger-b');

const delivered = await pollUntil({
  label: 'workspace subscriber deliveries',
  check: async () => ({
    count: await workspaceDeliveryCount(workspaceSubscriber.subscriber_id),
  }),
  isReady: ({ count }) => count >= 2,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      base_url: runtime.baseUrl,
      workspace_id: workspaceId,
      workspace_subscriber_id: workspaceSubscriber.subscriber_id,
      first_channel_id: firstSetup.channel.channel_id,
      second_channel_id: secondSetup.channel.channel_id,
      delivery_count_for_workspace_subscriber: delivered.count,
      first_created: firstSetup.created,
      second_created: secondSetup.created,
      health: {
        status: health.status,
        app: health.app,
      },
    },
    null,
    2,
  ),
);
