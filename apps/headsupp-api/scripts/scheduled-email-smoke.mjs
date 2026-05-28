import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { checkHealth } from './smoke/events.mjs';
import { genericSmokeIds, provisionGenericScenario } from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
const emailDestination = process.env.HEADSUPP_SMOKE_EMAIL_DESTINATION;
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_EMAIL_DESTINATION', emailDestination);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('scheduled_email');
const signalKey = 'smoke.email.scheduled';
const startedAt = new Date().toISOString();
const health = await checkHealth(runtime.baseUrl);

function watchId(suffix) {
  return `${ids.watch}_${suffix}`;
}

async function insertWatch({ suffix, type, config }) {
  const now = new Date().toISOString();
  const id = watchId(suffix);
  await client.d1Query(
    `INSERT INTO watches (
      id, watch_id, workspace_id, channel_id, signal_id, name, watch_type, config_json,
      cooldown_seconds, escalation_json, recovery_json, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      id,
      ids.workspace,
      ids.channel,
      ids.signal,
      `[Heads Up Smoke] ${type}`,
      type,
      JSON.stringify(config),
      0,
      null,
      null,
      1,
      now,
      now,
    ],
  );
}

async function insertAggregate() {
  const bucketStart = new Date(Date.now() - 10 * 60_000).toISOString();
  const now = new Date().toISOString();
  await client.d1Query(
    `INSERT INTO aggregates (
      id, workspace_id, channel_id, signal_id, signal_key, bucket_type, bucket_start_at,
      dimensions_hash, dimensions_json, sum_value, count_value, min_value, max_value,
      last_value, avg_value, first_event_at, last_event_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${ids.signal}:minute:${bucketStart}`,
      ids.workspace,
      ids.channel,
      ids.signal,
      signalKey,
      'minute',
      bucketStart,
      'd0',
      '{}',
      42,
      1,
      42,
      42,
      42,
      42,
      bucketStart,
      bucketStart,
      now,
    ],
  );
}

async function sentCounts() {
  const rows = await client.d1Query(
    `SELECT alert.watch_id, COUNT(*) AS sent
     FROM alerts alert
     JOIN alert_deliveries delivery ON delivery.alert_id = alert.id
     WHERE alert.channel_id = ? AND delivery.subscriber_id = ? AND delivery.status = 'sent'
     GROUP BY alert.watch_id`,
    [ids.channel, ids.subscriber],
  );
  return Object.fromEntries((rows?.results || []).map((row) => [row.watch_id, Number(row.sent || 0)]));
}

async function disableScheduledEmailProof() {
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

await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl: emailDestination,
  subscriberType: 'email',
  subscriberMode: 'alert',
  subscriberName: '[Heads Up Smoke] scheduled email recipient',
  signalKey,
  watchName: '[Heads Up Smoke] unused scheduled seed',
  cooldownSeconds: 0,
});

await client.d1Query('DELETE FROM watches WHERE id = ?', [ids.watch]);
await client.d1Query('UPDATE subscribers SET config_json = ?, updated_at = ? WHERE id = ?', [
  JSON.stringify({
    template_id: 'base_alert_v1',
    labels: {
      title_template: '[Heads Up Smoke] Scheduled {severity}: {value}',
      summary_template: '[Heads Up Smoke] Scheduled watch proof fired.',
    },
  }),
  new Date().toISOString(),
  ids.subscriber,
]);
await insertAggregate();
await insertWatch({
  suffix: 'missing',
  type: 'MISSING_EXPECTED',
  config: {
    expected_every: { count: 1, unit: 'minute' },
    minimum_count: 2,
    grace_seconds: 0,
    severity: 'warning',
    bucket_type: 'minute',
  },
});
await insertWatch({
  suffix: 'reminder',
  type: 'REMINDER_DUE',
  config: {
    due_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    lead: { count: 2, unit: 'hour' },
    expires_after_seconds: 7200,
    severity: 'warning',
    label: '[Heads Up Smoke] Reminder',
  },
});
await insertWatch({
  suffix: 'digest',
  type: 'DIGEST',
  config: {
    schedule: 'hourly',
    severity: 'info',
    include: ['last_value', 'count_value'],
  },
});

const expected = [watchId('missing'), watchId('reminder'), watchId('digest')];
let proof = null;
try {
  proof = await pollUntil({
    label: 'scheduled email deliveries',
    attempts: 50,
    intervalMs: 3000,
    check: sentCounts,
    isReady: (counts) => expected.every((id) => Number(counts[id] || 0) >= 1),
  });
} finally {
  await disableScheduledEmailProof();
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      recipient_hint: `${String(emailDestination).slice(0, 2)}***`,
      health: { status: health.status, app: health.app },
      workspace_id: ids.workspace,
      channel_id: ids.channel,
      signal_key: signalKey,
      expected_watch_ids: expected,
      sent_counts: proof,
      cleanup: {
        scheduled_watches_disabled: true,
        subscriber_disabled: true,
      },
      expected_email_behavior: 'Three real scheduled smoke emails: missing expected, reminder due, and digest.',
    },
    null,
    2,
  ),
);
