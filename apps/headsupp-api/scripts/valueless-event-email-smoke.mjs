import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  latestAlert,
  latestDelivery,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

// Smallest real-email end-to-end proof for value-less event occurrence signals:
// one event in -> one alert + one sent email delivery out.
const runtime = smokeRuntime();
const emailDestination = process.env.HEADSUPP_SMOKE_EMAIL_DESTINATION;
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_EMAIL_DESTINATION', emailDestination);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('valueless_event_email');
const signalKey = 'forecast.goal.reached';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;
const goalId = 'goal_valueless_email_1';
const idempotencyKey = `generic-smoke:${runId}:${goalId}:valueless-email`;
const health = await checkHealth(runtime.baseUrl);

const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl: emailDestination,
  subscriberType: 'email',
  subscriberMode: 'alert',
  subscriberName: 'Value-less event email smoke recipient',
  signalKey,
  watchName: 'Forecast goal reached (value-less, email)',
  watchType: 'EVENT_OCCURRENCE',
  watchConfig: {
    event_type: 'goal_reached',
    dedupe_key_path: 'fields.goal_id',
    severity: 'success',
    template_id: 'forecast_win_v1',
  },
  cooldownSeconds: 0,
});

await client.d1Query('UPDATE subscribers SET config_json = ?, destination_url_redacted = ?, updated_at = ? WHERE id = ?', [
  JSON.stringify({
    template_id: 'forecast_win_v1',
    actions: ['snooze_1h', 'stop_watching'],
  }),
  `${String(emailDestination).slice(0, 2)}***`,
  new Date().toISOString(),
  ids.subscriber,
]);

async function dedupeRow() {
  return client.d1First('SELECT status, processed_at FROM raw_event_dedupe WHERE idempotency_key = ?', [idempotencyKey]);
}

const before = await smokeCounts(client, ids);
const accepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: [
    {
      idempotency_key: idempotencyKey,
      signal_key: signalKey,
      occurred_at: new Date().toISOString(),
      value: { num: null },
      fields: {
        source: 'valueless-event-email-smoke',
        event_type: 'goal_reached',
        tone: 'success',
        icon_variant: 'trophy',
        forecast_id: 'forecast_valueless_email',
        goal_id: goalId,
        attention_family: `goal:${goalId}`,
        forecast_name: 'Q2 Revenue',
        resource_name: 'Q2 Revenue',
        notification: {
          title: 'Q2 Revenue',
          summary: 'Goal reached without a metric value.',
          detail: 'End-to-end email proof for value-less event occurrence.',
          headline_value: '£10,000',
          headline_label: 'Goal reached',
        },
      },
      cta: {
        label: 'View forecast',
        url: 'https://example.com/forecasts/forecast_valueless_email',
        variant: 'success',
      },
    },
  ],
});

const result = await pollUntil({
  label: 'value-less event email delivery',
  attempts: 50,
  intervalMs: 3000,
  check: async () => ({
    counts: await smokeCounts(client, ids),
    alert: await latestAlert(client, ids),
    delivery: await latestDelivery(client, ids),
    dedupe: await dedupeRow(),
  }),
  isReady: ({ counts, delivery, dedupe }) =>
    counts.alerts === 1 && delivery?.status === 'sent' && dedupe?.status === 'processed' && Boolean(dedupe?.processed_at),
});

if (result.delivery?.status !== 'sent') {
  throw new Error(`Value-less event email did not send: ${JSON.stringify(result.delivery)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      health: { status: health.status, app: health.app },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        connector_key: setup.connectorKey,
        signal_key: signalKey,
        watch: 'EVENT_OCCURRENCE goal_reached (value-less, email)',
        recipient_hint: `${String(emailDestination).slice(0, 2)}***`,
      },
      ingest: {
        events_queued: accepted.queued,
        idempotency_key: idempotencyKey,
      },
      assertions: {
        alerts: result.counts.alerts,
        sent_deliveries: result.counts.sent_deliveries,
        delivery_status: result.delivery?.status,
        delivery_response_code: result.delivery?.response_code,
        dedupe_status: result.dedupe?.status,
        dedupe_processed_at: result.dedupe?.processed_at,
      },
      latest_alert: result.alert,
      latest_delivery: result.delivery,
      counts: { before, after: result.counts },
      expected_email_behavior: 'One real email sent from a single value-less EVENT_OCCURRENCE event.',
    },
    null,
    2,
  ),
);
