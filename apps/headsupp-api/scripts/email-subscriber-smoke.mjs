import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, buildMetricEvents, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  latestAlert,
  latestDelivery,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil, sleep } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
const emailDestination = process.env.HEADSUPP_SMOKE_EMAIL_DESTINATION;

requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_EMAIL_DESTINATION', emailDestination);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('email_subscriber');
const signalKey = 'sample.highest_purchase';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;
const health = await checkHealth(runtime.baseUrl);

async function disableEmailSubscriberProof() {
  const now = new Date().toISOString();
  await client.d1Query('UPDATE watches SET enabled = 0, updated_at = ? WHERE channel_id = ?', [now, ids.channel]);
  await client.d1Query('UPDATE subscribers SET enabled = 0, updated_at = ? WHERE channel_id = ?', [now, ids.channel]);
  await client.d1Query(
    `UPDATE alert_deliveries
     SET status = 'ignored', updated_at = ?
     WHERE alert_id IN (SELECT id FROM alerts WHERE channel_id = ?)
       AND status IN ('pending', 'retrying')`,
    [now, ids.channel],
  );
}

const setup = await provisionGenericScenario({
  client,
  ids,
  subscriberUrl: emailDestination,
  subscriberType: 'email',
  subscriberMode: 'alert',
  subscriberName: 'Smoke Email Alerts',
  signalKey,
  watchName: 'Highest sample purchase high',
  watchType: 'LAST_VALUE_GT',
  watchConfig: {
    threshold: 8,
    severity: 'warning',
    bucket_type: 'minute',
  },
});

await client.d1Query('UPDATE subscribers SET config_json = ?, destination_url_redacted = ?, updated_at = ? WHERE id = ?', [
  JSON.stringify({
    template_id: 'base_alert_v1',
    actions: ['snooze_1h', 'snooze_1d', 'stop_watching'],
    value_format: 'money_usd_2',
    locale: 'en-US',
    timezone: 'UTC',
    labels: {
      title_template: 'Highest sample purchase: {value}',
      summary_template: 'Your highest sample purchase reached {value}; threshold is {threshold}.',
      current_label: 'Highest purchase',
      threshold_label: 'Alert threshold',
    },
  }),
  `${String(emailDestination).slice(0, 2)}***`,
  new Date().toISOString(),
  ids.subscriber,
]);

try {
const before = await smokeCounts(client, ids);
const normalAccepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: buildMetricEvents({
    runId,
    count: 5,
    signalKey,
    value: 4,
    source: 'email-subscriber-smoke',
  }),
});

for (let attempt = 0; attempt < 6; attempt += 1) {
  await sleep(2500);
  const counts = await smokeCounts(client, ids);
  if (counts.alerts > before.alerts) {
    throw new Error(`Normal events unexpectedly created an alert: ${JSON.stringify(counts)}`);
  }
}

const triggerAccepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'trigger-highest',
      signalKey,
      value: 9.5,
      source: 'email-subscriber-smoke',
      fields: {
        merchant: 'Demo Merchant',
      },
      cta: {
        label: 'View sample spend',
        url: 'https://example.com/sample/spend',
      },
    }),
  ],
});

const delivered = await pollUntil({
  label: 'email subscriber delivery',
  check: async () => ({
    counts: await smokeCounts(client, ids),
    delivery: await latestDelivery(client, ids),
    alert: await latestAlert(client, ids),
  }),
  isReady: ({ delivery }) => Boolean(delivery && ['sent', 'failed'].includes(delivery.status)),
});

if (delivered.delivery?.status !== 'sent') {
  throw new Error(`Email delivery did not reach sent status: ${JSON.stringify(delivered.delivery)}`);
}

const responseBody = JSON.parse(delivered.delivery.response_body || '{}');
const expectedActions = ['snooze_1h', 'snooze_1d', 'stop_watching'];
for (const actionId of expectedActions) {
  if (!responseBody.action_ids?.includes(actionId)) {
    throw new Error(`Email delivery response did not include action ${actionId}: ${delivered.delivery.response_body}`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        connector_key: setup.connectorKey,
        signal_key: signalKey,
        watch: 'LAST_VALUE_GT threshold 8',
        subscriber_type: 'email',
      },
      ingest: {
        normal_events_sent: 5,
        normal_events_queued: normalAccepted.queued,
        trigger_events_sent: 1,
        trigger_events_queued: triggerAccepted.queued,
      },
      counts: {
        before,
        after_trigger: delivered.counts,
      },
      latest_alert: delivered.alert,
      latest_delivery: delivered.delivery,
      expected_action_buttons: expectedActions,
      recipient_hint: `${String(emailDestination).slice(0, 2)}***`,
      cleanup: {
        smoke_watch_disabled: true,
        subscriber_disabled: true,
      },
      expected_email_behavior: 'One warning email after trigger event value > 8 with SNOOZE 1H, SNOOZE 1D, and STOP WATCHING buttons.',
      health: {
        status: health.status,
        app: health.app,
      },
    },
    null,
    2,
  ),
);
} finally {
  await disableEmailSubscriberProof();
}
