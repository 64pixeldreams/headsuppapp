import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { checkHealth } from './smoke/events.mjs';
import { genericSmokeIds, provisionGenericScenario } from './smoke/generic-provisioning.mjs';
import { pollUntil, sleep } from './smoke/polling.mjs';
import { redactUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('scheduled');
const signalKey = 'demo.scheduled';
const startedAt = new Date().toISOString();
const now = new Date();
const closedBucketStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() - 2, 0, 0, 0)).toISOString();
const subscriberUrl = process.env.HEADSUPP_SMOKE_WEBHOOK_URL || 'https://example.com/headsupp-smoke';

function watchId(suffix) {
  return `${ids.watch}_${suffix}`;
}

async function insertWatch({ id, name, type, config, cooldownSeconds = 60 }) {
  const timestamp = new Date().toISOString();
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
      name,
      type,
      JSON.stringify(config),
      cooldownSeconds,
      null,
      null,
      1,
      timestamp,
      timestamp,
    ],
  );
}

async function insertAggregate() {
  const timestamp = new Date().toISOString();
  await client.d1Query(
    `INSERT INTO aggregates (
      id, workspace_id, channel_id, signal_id, signal_key, bucket_type, bucket_start_at,
      dimensions_json, sum_value, count_value, min_value, max_value, last_value, avg_value,
      first_event_at, last_event_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${ids.signal}:hour:${closedBucketStart}`,
      ids.workspace,
      ids.channel,
      ids.signal,
      signalKey,
      'hour',
      closedBucketStart,
      '{}',
      42,
      1,
      42,
      42,
      42,
      42,
      closedBucketStart,
      closedBucketStart,
      timestamp,
    ],
  );
}

async function scheduledCounts() {
  const [missingAlerts, digestAlerts, aggregateDeliveries, digestState, aggregatePayload] = await Promise.all([
    client.d1First('SELECT COUNT(*) AS count FROM alerts WHERE watch_id = ?', [watchId('missing')]),
    client.d1First('SELECT COUNT(*) AS count FROM alerts WHERE watch_id = ?', [watchId('digest')]),
    client.d1First('SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE subscriber_id = ?', [ids.subscriber]),
    client.d1First('SELECT last_digest_at FROM watch_states WHERE watch_id = ?', [watchId('digest')]),
    client.d1First('SELECT payload_json FROM aggregate_deliveries WHERE subscriber_id = ? LIMIT 1', [ids.subscriber]),
  ]);

  return {
    missing_alerts: Number(missingAlerts?.count || 0),
    digest_alerts: Number(digestAlerts?.count || 0),
    aggregate_deliveries: Number(aggregateDeliveries?.count || 0),
    digest_state_updated: Boolean(digestState?.last_digest_at),
    aggregate_payload: aggregatePayload?.payload_json ? JSON.parse(aggregatePayload.payload_json) : null,
  };
}

const health = await checkHealth(runtime.baseUrl);
await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl,
  subscriberType: 'webhook',
  subscriberMode: 'aggregate_forward',
  subscriberName: 'Scheduled smoke aggregate receiver',
  signalKey,
  watchName: 'Scheduled smoke unused threshold',
});

await client.d1Query('DELETE FROM watches WHERE id = ?', [ids.watch]);
await insertAggregate();
await insertWatch({
  id: watchId('missing'),
  name: 'Scheduled missing expected smoke',
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
  id: watchId('digest'),
  name: 'Scheduled digest smoke',
  type: 'DIGEST',
  config: {
    schedule: 'hourly',
    severity: 'info',
    include: ['last_value', 'count_value'],
  },
});
await insertWatch({
  id: watchId('aggregate_forward'),
  name: 'Scheduled aggregate forward smoke',
  type: 'AGGREGATE_FORWARD',
  config: {
    bucket_type: 'hour',
    emit_after_grace_seconds: 0,
    subscriber_id: ids.subscriber,
    include: ['last_value', 'count_value', 'avg_value'],
  },
});

const before = await scheduledCounts();
const firstPass = await pollUntil({
  label: 'scheduled watches cron pass',
  attempts: 40,
  intervalMs: 3000,
  check: scheduledCounts,
  isReady: (counts) =>
    counts.missing_alerts >= 1 &&
    counts.digest_alerts >= 1 &&
    counts.digest_state_updated &&
    counts.aggregate_deliveries >= 1 &&
    counts.aggregate_payload?.delivery_id &&
    counts.aggregate_payload?.dedupe_key,
});

await sleep(70_000);
const secondPass = await scheduledCounts();
if (secondPass.aggregate_deliveries !== firstPass.aggregate_deliveries) {
  throw new Error(`Aggregate forward duplicated closed bucket delivery: ${JSON.stringify(secondPass)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      receiver: redactUrl(subscriberUrl),
      health: {
        status: health.status,
        app: health.app,
      },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        signal_key: signalKey,
        missing_watch_id: watchId('missing'),
        digest_watch_id: watchId('digest'),
        aggregate_forward_watch_id: watchId('aggregate_forward'),
      },
      counts: {
        before,
        first_pass: {
          ...firstPass,
          aggregate_payload: {
            type: firstPass.aggregate_payload?.type,
            delivery_id_present: Boolean(firstPass.aggregate_payload?.delivery_id),
            dedupe_key_present: Boolean(firstPass.aggregate_payload?.dedupe_key),
          },
        },
        second_pass: {
          ...secondPass,
          aggregate_payload: {
            type: secondPass.aggregate_payload?.type,
            delivery_id_present: Boolean(secondPass.aggregate_payload?.delivery_id),
            dedupe_key_present: Boolean(secondPass.aggregate_payload?.dedupe_key),
          },
        },
      },
    },
    null,
    2,
  ),
);
