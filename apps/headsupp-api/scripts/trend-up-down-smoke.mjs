import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import { genericSmokeIds, latestDelivery, provisionGenericScenario, smokeCounts } from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const startedAt = new Date().toISOString();
const health = await checkHealth(runtime.baseUrl);

function minuteOffset(minutes) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

async function runTrendCase({ name, watchType, values }) {
  const ids = genericSmokeIds(`trend_${name}`);
  const signalKey = `smoke.trend.${name}`;
  const runId = `${ids.scenarioId}:${Date.now()}`;
  const [previousValue, currentValue] = values;
  const previousMinute = minuteOffset(-3);
  const currentMinute = minuteOffset(-2);

  const setup = await provisionGenericScenario({
    client,
    ids,
    slackWebhookUrl: null,
    subscriberUrl: 'smoke://status/200',
    subscriberType: 'webhook',
    subscriberMode: 'alert',
    subscriberName: `[Heads Up Smoke] trend ${name}`,
    signalKey,
    watchName: `[Heads Up Smoke] ${watchType}`,
    watchType,
    watchConfig: {
      threshold: 50,
      severity: 'warning',
      bucket_type: 'minute',
      window: { size: 2 },
      field: 'last_value',
    },
    cooldownSeconds: 0,
  });

  const before = await smokeCounts(client, ids);
  const accepted = await sendSignedEvents({
    baseUrl: runtime.baseUrl,
    connectorKey: setup.connectorKey,
    connectorSecret: setup.connectorSecret,
    events: [
      buildMetricEvent({
        runId,
        name: `${name}:previous`,
        signalKey,
        value: previousValue,
        source: 'trend-up-down-smoke',
        occurredAt: previousMinute,
        fields: { smoke_case: name },
      }),
      buildMetricEvent({
        runId,
        name: `${name}:current`,
        signalKey,
        value: currentValue,
        source: 'trend-up-down-smoke',
        occurredAt: currentMinute,
        fields: { smoke_case: name },
      }),
    ],
  });

  const proof = await pollUntil({
    label: `${name} trend alert`,
    attempts: 40,
    intervalMs: 3000,
    check: async () => ({
      counts: await smokeCounts(client, ids),
      delivery: await latestDelivery(client, ids),
    }),
    isReady: ({ counts, delivery }) => counts.alerts >= 1 && delivery?.status === 'sent',
  });

  return {
    name,
    watch_type: watchType,
    signal_key: signalKey,
    workspace_id: ids.workspace,
    channel_id: ids.channel,
    connector_key: setup.connectorKey,
    input_values: { previous: previousValue, current: currentValue },
    queued: accepted.queued,
    counts_before: before,
    counts_after: proof.counts,
    delivery: {
      id: proof.delivery?.id,
      status: proof.delivery?.status,
      response_code: proof.delivery?.response_code,
    },
  };
}

const cases = [
  { name: 'trend_up', watchType: 'TREND_UP_GT', values: [10, 25] },
  { name: 'trend_down', watchType: 'TREND_DOWN_GT', values: [25, 10] },
];

const results = [];
for (const testCase of cases) {
  results.push(await runTrendCase(testCase));
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      health: { status: health.status, app: health.app },
      cases: results,
      expected_behavior: 'Each trend case ingests two real events and produces one sent alert delivery.',
    },
    null,
    2,
  ),
);
