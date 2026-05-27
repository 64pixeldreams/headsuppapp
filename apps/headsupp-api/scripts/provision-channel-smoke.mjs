import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import { cleanupGenericScenario, genericSmokeIds } from './smoke/generic-provisioning.mjs';
import { pollUntil, sleep } from './smoke/polling.mjs';
import { redactSecret, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
const emailDestination = process.env.HEADSUPP_SMOKE_EMAIL_DESTINATION;

requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_SERVICE_API_KEY or HEADSUPP_API_KEY', runtime.serviceApiKey);
requireEnv('HEADSUPP_SMOKE_EMAIL_DESTINATION', emailDestination);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('provision_channel');
const signalKey = 'demo.provision.metric';
const runId = `${ids.scenarioId}:${Date.now()}`;

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

async function latestChannelAlert() {
  return client.d1First(
    `SELECT id, severity, current_value, summary_text, triggered_at
     FROM alerts
     WHERE channel_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [ids.channel],
  );
}

async function latestChannelDelivery() {
  return client.d1First(
    `SELECT id, alert_id, subscriber_id, status, attempt_count, response_code, response_body, updated_at
     FROM alert_deliveries
     WHERE alert_id IN (SELECT id FROM alerts WHERE channel_id = ?)
     ORDER BY created_at DESC
     LIMIT 1`,
    [ids.channel],
  );
}

await cleanupGenericScenario(client, ids);
await client.d1Query('DELETE FROM subscribers WHERE workspace_id = ?', [ids.workspace]);
const health = await checkHealth(runtime.baseUrl);

const payload = {
  workspace: {
    workspace_key: `headsupp:${ids.scenarioId}`,
    name: `Smoke ${ids.scenarioId} Workspace`,
    source_app: 'headsupp-smoke',
    external_tenant_id: ids.scenarioId,
    external_user_id: `${ids.scenarioId}-user`,
  },
  channel: {
    channel_id: ids.channel,
    channel_key: `headsupp:${ids.scenarioId}:channel`,
    name: `Smoke ${ids.scenarioId} Channel`,
    purpose: 'Provision channel smoke',
  },
  connector: {
    connector_id: ids.connector,
    connector_key: ids.connectorKey,
  },
  signals: [
    {
      signal_id: ids.signal,
      signal_key: signalKey,
      description: 'Provision smoke metric',
    },
  ],
  watches: [
    {
      watch_id: ids.watch,
      signal_key: signalKey,
      name: 'Provision metric high',
      watch_type: 'LAST_VALUE_GT',
      config: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
      cooldown_seconds: 1,
    },
  ],
  subscribers: [
    {
      subscriber_type: 'email',
      destination_url: emailDestination,
      name: 'Provision smoke email',
      mode: 'alert',
      config: {
        template_id: 'metric_alert_v1',
        actions: ['snooze_1h', 'snooze_1d', 'stop_watching'],
      },
    },
  ],
};

const firstSetup = await callFunction('admin.provisionChannel', payload);
const connectorSecret = firstSetup.connector?.connector_secret;
if (!connectorSecret) throw new Error(`Expected first provision to return connector secret: ${JSON.stringify(firstSetup.connector)}`);

await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: firstSetup.connector.connector_key,
  connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'normal',
      signalKey,
      value: 4,
      source: 'provision-channel-smoke',
    }),
  ],
});
await sleep(5000);

const triggerAccepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: firstSetup.connector.connector_key,
  connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'trigger',
      signalKey,
      value: 12,
      source: 'provision-channel-smoke',
      fields: {
        notification: {
          title: 'Provision channel smoke',
          summary: 'One-call setup created this alert path.',
        },
        metrics: [
          { label: 'Current value', value: '12' },
          { label: 'Threshold', value: '10' },
        ],
      },
      cta: {
        label: 'View setup',
        url: 'https://api.headsupp.io/health',
      },
    }),
  ],
});

const delivered = await pollUntil({
  label: 'provision channel email delivery',
  check: async () => ({
    alert: await latestChannelAlert(),
    delivery: await latestChannelDelivery(),
  }),
  isReady: ({ delivery }) => Boolean(delivery && ['sent', 'failed'].includes(delivery.status)),
});

const secondSetup = await callFunction('admin.provisionChannel', payload);
if (secondSetup.secret_returned) {
  throw new Error('Repeat provision unexpectedly returned connector secret.');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      base_url: runtime.baseUrl,
      setup: {
        workspace_id: firstSetup.workspace.workspace_id,
        channel_id: firstSetup.channel.channel_id,
        connector_key: firstSetup.connector.connector_key,
        connector_secret: redactSecret(connectorSecret),
        signal_key: signalKey,
      },
      first_created: firstSetup.created,
      first_reused: firstSetup.reused,
      second_created: secondSetup.created,
      second_reused: secondSetup.reused,
      trigger_queued: triggerAccepted.queued,
      latest_alert: delivered.alert,
      latest_delivery: delivered.delivery,
      health: {
        status: health.status,
        app: health.app,
      },
    },
    null,
    2,
  ),
);
