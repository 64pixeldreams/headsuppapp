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
const signalKey = 'coffee.sales.pace';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;
const health = await checkHealth(runtime.baseUrl);
const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: runtime.slackWebhookUrl,
  signalKey,
  subscriberName: '[Heads Up Smoke] Coffee Slack proof',
  watchName: 'Coffee sales pace needs attention',
  watchConfig: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
});

await client.d1Query('UPDATE channels SET name = ?, metadata_json = ?, updated_at = ? WHERE id = ?', [
  'Coffee launch dashboard',
  JSON.stringify({
    forecast_id: 'coffee_launch_q3',
    forecast_name: 'Coffee Launch Q3',
    resource_name: 'Coffee Launch Q3',
  }),
  new Date().toISOString(),
  ids.channel,
]);
await client.d1Query('UPDATE subscribers SET config_json = ?, updated_at = ? WHERE id = ?', [
  JSON.stringify({
    template_id: 'base_alert_slack_v1',
    source_label: 'Heads Up Coffee',
    labels: {
      title_template: 'Coffee sales pace is heating up: {value} orders',
      summary_template: 'Coffee orders crossed the {threshold}-order watch line. Review the launch dashboard before the next campaign window.',
      current_label: 'Coffee orders',
      threshold_label: 'Watch line',
      watch_label: 'Scenario',
      watch_value: 'Q3 coffee launch',
    },
  }),
  new Date().toISOString(),
  ids.subscriber,
]);

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
    source: 'coffee-slack-smoke',
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
      source: 'coffee-slack-smoke',
      fields: {
        product: 'coffee',
        campaign: 'Q3 launch',
      },
      dimensions: {
        product: 'coffee',
      },
      cta: {
        label: 'Open coffee dashboard',
        url: 'https://headsupp.io/demo/coffee-launch',
      },
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
        watch: 'Coffee sales pace LAST_VALUE_GT threshold 10',
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
      expected_slack_text: 'Coffee sales pace is heating up: 15 orders.',
      latest_delivery: delivered.delivery,
    },
    null,
    2,
  ),
);
