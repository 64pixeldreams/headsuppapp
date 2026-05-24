import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, buildMetricEvents, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  latestDelivery,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil, sleep } from './smoke/polling.mjs';
import { redactSlackUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_SLACK_WEBHOOK_URL', runtime.slackWebhookUrl);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('generic_slack');
const signalKey = 'demo.metric';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;
const health = await checkHealth(runtime.baseUrl);
const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: runtime.slackWebhookUrl,
  signalKey,
  watchName: 'Generic smoke metric high',
  watchConfig: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
});

const before = await smokeCounts(client, ids);
const normalAccepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: buildMetricEvents({
    runId,
    count: 20,
    signalKey,
    value: 5,
    source: 'generic-slack-smoke',
  }),
});

for (let attempt = 0; attempt < 6; attempt += 1) {
  await sleep(2500);
  const counts = await smokeCounts(client, ids);
  if (counts.alerts > before.alerts) {
    throw new Error(`Normal events unexpectedly created an alert: ${JSON.stringify(counts)}`);
  }
}

const afterNormal = await smokeCounts(client, ids);
const triggerAccepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'trigger',
      signalKey,
      value: 15,
      source: 'generic-slack-smoke',
    }),
  ],
});

const delivered = await pollUntil({
  label: 'generic Slack delivery',
  check: async () => ({
    counts: await smokeCounts(client, ids),
    delivery: await latestDelivery(client, ids),
  }),
  isReady: ({ counts, delivery }) => counts.sent_deliveries > 0 || delivery?.status === 'failed',
});

if (delivered.delivery?.status === 'failed') {
  throw new Error(`Slack delivery failed: ${JSON.stringify(delivered.delivery)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      slack_destination: redactSlackUrl(runtime.slackWebhookUrl),
      health: {
        status: health.status,
        app: health.app,
      },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        connector_key: setup.connectorKey,
        signal_key: signalKey,
        watch: 'LAST_VALUE_GT threshold 10',
      },
      ingest: {
        normal_events_sent: 20,
        normal_events_queued: normalAccepted.queued,
        trigger_events_sent: 1,
        trigger_events_queued: triggerAccepted.queued,
      },
      counts: {
        before,
        after_normal: afterNormal,
        after_trigger: delivered.counts,
      },
      expected_slack_text: 'Generic smoke metric high is warning at 15.',
      latest_delivery: delivered.delivery,
    },
    null,
    2,
  ),
);
