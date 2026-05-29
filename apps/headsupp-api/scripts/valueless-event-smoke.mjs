import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  latestDelivery,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

// Regression proof for the "no alerts fired for 3 days" incident.
//
// Foretic emits event-occurrence signals (goal reached / bucket close) WITHOUT a
// numeric value. Ingest accepted them (HTTP 202) but the queue consumer threw on
// the null value, poisoning the whole batch and stranding every event in
// 'processing' forever. This smoke sends the exact value-less shape and proves:
//   1. an alert fires + delivery is sent (the consumer routes value-less events
//      to event-occurrence watches), and
//   2. the raw event reaches status 'processed' (no stranding).

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('valueless_event');
const signalKey = 'forecast.goal.reached';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;
const goalId = 'goal_valueless_1';
const idempotencyKey = `generic-smoke:${runId}:${goalId}:valueless`;
const health = await checkHealth(runtime.baseUrl);

const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl: 'smoke://status/200',
  subscriberType: 'webhook',
  subscriberMode: 'alert',
  subscriberName: 'Value-less event smoke receiver',
  signalKey,
  watchName: 'Forecast goal reached (value-less)',
  watchType: 'EVENT_OCCURRENCE',
  watchConfig: {
    event_type: 'goal_reached',
    dedupe_key_path: 'fields.goal_id',
    severity: 'success',
    template_id: 'forecast_win_v1',
  },
  cooldownSeconds: 0,
});

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
      // The exact production shape: no numeric value.
      value: { num: null },
      fields: {
        source: 'valueless-event-smoke',
        event_type: 'goal_reached',
        tone: 'success',
        icon_variant: 'trophy',
        forecast_id: 'forecast_valueless',
        goal_id: goalId,
        forecast_name: 'Q2 Revenue',
        resource_name: 'Q2 Revenue',
        notification: {
          title: 'Q2 Revenue',
          summary: 'Goal reached without a metric value.',
          detail: 'Event-occurrence signals carry no numeric value.',
          headline_value: '£10,000',
          headline_label: 'Goal reached',
        },
      },
      cta: {
        label: 'View forecast',
        url: 'https://example.com/forecasts/forecast_valueless',
        variant: 'success',
      },
    },
  ],
});

const result = await pollUntil({
  label: 'value-less event alert + processed dedupe row',
  attempts: 40,
  intervalMs: 3000,
  check: async () => ({
    counts: await smokeCounts(client, ids),
    delivery: await latestDelivery(client, ids),
    dedupe: await dedupeRow(),
  }),
  isReady: ({ counts, delivery, dedupe }) =>
    counts.alerts === 1 && delivery?.status === 'sent' && dedupe?.status === 'processed' && Boolean(dedupe?.processed_at),
});

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
        watch: 'EVENT_OCCURRENCE goal_reached (value-less)',
      },
      ingest: {
        events_queued: accepted.queued,
        idempotency_key: idempotencyKey,
      },
      assertions: {
        alerts: result.counts.alerts,
        sent_deliveries: result.counts.sent_deliveries,
        delivery_status: result.delivery?.status,
        dedupe_status: result.dedupe?.status,
        dedupe_processed_at: result.dedupe?.processed_at,
      },
      counts: { before, after: result.counts },
    },
    null,
    2,
  ),
);
