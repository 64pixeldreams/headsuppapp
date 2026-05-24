import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  latestAlert,
  latestDelivery,
  provisionGenericScenario,
  smokeCounts,
  updateGenericWatchConfig,
} from './smoke/generic-provisioning.mjs';
import { pollUntil, sleep } from './smoke/polling.mjs';
import { redactSlackUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_SLACK_WEBHOOK_URL', runtime.slackWebhookUrl);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('alert_decisions');
const signalKey = 'demo.alert_decision';
const runId = `${ids.scenarioId}:${Date.now()}`;
const startedAt = new Date().toISOString();
const health = await checkHealth(runtime.baseUrl);
const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: runtime.slackWebhookUrl,
  signalKey,
  watchName: 'Generic alert decision smoke',
  watchConfig: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
  recovery: { enabled: true, severity: 'recovery', condition: 'value <= 10' },
  cooldownSeconds: 600,
});

async function sendOne(name, value) {
  return sendSignedEvents({
    baseUrl: runtime.baseUrl,
    connectorKey: setup.connectorKey,
    connectorSecret: setup.connectorSecret,
    events: [
      buildMetricEvent({
        runId,
        name,
        signalKey,
        value,
        source: 'alert-decisions-smoke',
      }),
    ],
  });
}

async function waitForAlertCount(label, expectedAlerts, expectedSentDeliveries) {
  return pollUntil({
    label,
    check: async () => ({
      counts: await smokeCounts(client, ids),
      alert: await latestAlert(client, ids),
      delivery: await latestDelivery(client, ids),
    }),
    isReady: ({ counts, delivery }) =>
      counts.alerts >= expectedAlerts && counts.sent_deliveries >= expectedSentDeliveries && delivery?.status !== 'failed',
  });
}

const before = await smokeCounts(client, ids);

const firstTrigger = await sendOne('warning-trigger', 15);
const firstAlert = await waitForAlertCount('first warning alert', 1, 1);

const suppressedTrigger = await sendOne('suppressed-trigger', 16);
await sleep(10_000);
const afterSuppressed = await smokeCounts(client, ids);
if (afterSuppressed.alerts !== firstAlert.counts.alerts) {
  throw new Error(`Cooldown failed to suppress repeat alert: ${JSON.stringify(afterSuppressed)}`);
}

await updateGenericWatchConfig({
  client,
  ids,
  config: { threshold: 10, severity: 'critical', bucket_type: 'minute' },
});
const escalationTrigger = await sendOne('critical-escalation', 25);
const escalationAlert = await waitForAlertCount('critical escalation alert', 2, 2);

const recoveryTrigger = await sendOne('recovery', 5);
const recoveryAlert = await waitForAlertCount('recovery alert', 3, 3);

const repeatedRecovery = await sendOne('repeated-recovery', 4);
await sleep(10_000);
const afterRepeatedRecovery = await smokeCounts(client, ids);
if (afterRepeatedRecovery.alerts !== recoveryAlert.counts.alerts) {
  throw new Error(`Repeated recovery created noise: ${JSON.stringify(afterRepeatedRecovery)}`);
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
        watch: 'LAST_VALUE_GT threshold 10 with recovery value <= 10',
      },
      ingest: {
        first_trigger_queued: firstTrigger.queued,
        suppressed_trigger_queued: suppressedTrigger.queued,
        escalation_trigger_queued: escalationTrigger.queued,
        recovery_trigger_queued: recoveryTrigger.queued,
        repeated_recovery_queued: repeatedRecovery.queued,
      },
      counts: {
        before,
        after_first_trigger: firstAlert.counts,
        after_suppressed_trigger: afterSuppressed,
        after_escalation: escalationAlert.counts,
        after_recovery: recoveryAlert.counts,
        after_repeated_recovery: afterRepeatedRecovery,
      },
      latest_alert: recoveryAlert.alert,
      latest_delivery: recoveryAlert.delivery,
      expected_slack_sequence: [
        'Generic alert decision smoke is warning at 15.',
        'Generic alert decision smoke is critical at 25.',
        'Generic alert decision smoke is recovery at 5.',
      ],
    },
    null,
    2,
  ),
);
