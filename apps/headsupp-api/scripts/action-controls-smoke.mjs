import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  deliveryCountsBySubscriber,
  genericSmokeIds,
  latestAlert,
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
const ids = genericSmokeIds('action_controls');
const signalKey = 'demo.action_controls';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;

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
        source: 'action-controls-smoke',
      }),
    ],
  });
}

async function insertActionControl({ id, actionType, targetType = 'watch', targetId = ids.watch, status = 'active', expiresAt = null }) {
  const now = new Date().toISOString();
  await client.d1Query(
    `INSERT INTO watch_action_controls (
      id, action_id, workspace_id, channel_id, target_type, target_id, action_type, status,
      reason, expires_at, actor_user_id, source_app, external_tenant_id, external_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      id,
      ids.workspace,
      ids.channel,
      targetType,
      targetId,
      actionType,
      status,
      `smoke ${actionType}`,
      expiresAt,
      'smoke:action-controls',
      'headsupp-smoke',
      ids.scenarioId,
      `${ids.scenarioId}-user`,
      now,
      now,
    ],
  );
}

async function clearActionControls() {
  await client.d1Query('UPDATE watch_action_controls SET status = ?, updated_at = ? WHERE channel_id = ?', [
    'cleared',
    new Date().toISOString(),
    ids.channel,
  ]);
}

async function waitForCounts(label, expectedAlerts, expectedSent) {
  return pollUntil({
    label,
    check: async () => ({
      counts: await smokeCounts(client, ids),
      alert: await latestAlert(client, ids),
      delivery: await latestDelivery(client, ids),
    }),
    isReady: ({ counts, delivery }) =>
      counts.alerts >= expectedAlerts && counts.sent_deliveries >= expectedSent && delivery?.status !== 'failed',
  });
}

async function waitForNextMinuteBoundary(bufferMs = 1200) {
  const now = Date.now();
  const msUntilNextMinute = 60_000 - (now % 60_000);
  await sleep(msUntilNextMinute + bufferMs);
}

async function latestWatchState() {
  return client.d1First(
    `SELECT watch_id, last_status, cooldown_until, last_evaluated_at, updated_at, state_json
     FROM watch_states
     WHERE watch_id = ?
     LIMIT 1`,
    [ids.watch],
  );
}

async function recentActionControls() {
  const result = await client.d1Query(
    `SELECT action_type, status, target_type, target_id, expires_at, created_at, updated_at
     FROM watch_action_controls
     WHERE channel_id = ?
     ORDER BY created_at DESC
     LIMIT 8`,
    [ids.channel],
  );
  return result?.results || [];
}

async function waitForResumedDelivery() {
  const accepted = [];
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    accepted.push(await sendOne(`resumed-alert-${attempt}`, 17 + (attempt - 1)));
    try {
      const resumed = await waitForCounts(`resumed action-controls alert (attempt ${attempt})`, 2, 2);
      return { resumed, accepted };
    } catch (error) {
      lastError = error;
      // Give control-state propagation a chance before retrying.
      await sleep(8_000);
    }
  }

  const [counts, latest, delivery, watchState, controls] = await Promise.all([
    smokeCounts(client, ids),
    latestAlert(client, ids),
    latestDelivery(client, ids),
    latestWatchState(),
    recentActionControls(),
  ]);
  throw new Error(
    `Timed out waiting for resumed action-controls alert after 3 attempts. ` +
      `last_error=${lastError?.message || 'n/a'} ` +
      `counts=${JSON.stringify(counts)} ` +
      `latest_alert=${JSON.stringify(latest)} ` +
      `latest_delivery=${JSON.stringify(delivery)} ` +
      `watch_state=${JSON.stringify(watchState)} ` +
      `recent_controls=${JSON.stringify(controls)}`,
  );
}

const health = await checkHealth(runtime.baseUrl);
const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: runtime.slackWebhookUrl,
  signalKey,
  watchName: 'Action controls smoke metric high',
  watchConfig: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
  cooldownSeconds: 0,
});

const before = await smokeCounts(client, ids);
const initialAccepted = await sendOne('initial-alert', 15);
const initial = await waitForCounts('initial action-controls alert', 1, 1);

await insertActionControl({
  id: `${ids.watch}_snooze`,
  actionType: 'snooze',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
});
const snoozedAccepted = await sendOne('snoozed-alert', 16);
await sleep(10_000);
const afterSnooze = await smokeCounts(client, ids);
if (afterSnooze.alerts !== initial.counts.alerts) {
  throw new Error(`Snooze failed to suppress alert: ${JSON.stringify(afterSnooze)}`);
}

await clearActionControls();
await insertActionControl({ id: `${ids.watch}_resume`, actionType: 'resume', status: 'completed' });
await waitForNextMinuteBoundary();
const resumedResult = await waitForResumedDelivery();
const resumed = resumedResult.resumed;

await insertActionControl({ id: `${ids.watch}_mute`, actionType: 'mute' });
const mutedAccepted = await sendOne('muted-alert', 18);
await sleep(10_000);
const afterMute = await smokeCounts(client, ids);
if (afterMute.alerts !== resumed.counts.alerts) {
  throw new Error(`Mute failed to suppress alert: ${JSON.stringify(afterMute)}`);
}

const latest = await latestAlert(client, ids);
await client.d1Query("UPDATE alert_deliveries SET status = 'retrying', updated_at = ? WHERE alert_id = ?", [
  new Date().toISOString(),
  latest.id,
]);
await insertActionControl({
  id: `${ids.watch}_ignore`,
  actionType: 'ignore',
  targetType: 'alert',
  targetId: latest.id,
});
await client.d1Query("UPDATE alert_deliveries SET status = 'ignored', updated_at = ? WHERE alert_id = ? AND status IN ('pending', 'retrying')", [
  new Date().toISOString(),
  latest.id,
]);
const ignoredDeliveries = await client.d1First(
  "SELECT COUNT(*) AS count FROM alert_deliveries WHERE alert_id = ? AND status = 'ignored'",
  [latest.id],
);
const deliveries = await deliveryCountsBySubscriber(client, ids.subscriber);

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      slack_destination: redactSlackUrl(runtime.slackWebhookUrl),
      health: { status: health.status, app: health.app },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        connector_key: setup.connectorKey,
        signal_key: signalKey,
        watch_id: ids.watch,
      },
      ingest: {
        initial_queued: initialAccepted.queued,
        snoozed_queued: snoozedAccepted.queued,
        resumed_queued_attempts: resumedResult.accepted.map((entry) => entry.queued),
        muted_queued: mutedAccepted.queued,
      },
      assertions: {
        snooze_suppressed: afterSnooze.alerts === initial.counts.alerts,
        resume_restored_delivery: resumed.counts.sent_deliveries >= 2,
        mute_suppressed: afterMute.alerts === resumed.counts.alerts,
        ignored_deliveries: Number(ignoredDeliveries?.count || 0),
      },
      counts: { before, initial: initial.counts, after_snooze: afterSnooze, resumed: resumed.counts, after_mute: afterMute },
      deliveries,
    },
    null,
    2,
  ),
);
