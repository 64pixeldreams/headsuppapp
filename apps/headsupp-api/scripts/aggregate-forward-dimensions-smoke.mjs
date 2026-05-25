import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { checkHealth } from './smoke/events.mjs';
import { genericSmokeIds, provisionGenericScenario } from './smoke/generic-provisioning.mjs';
import { pollUntil, sleep } from './smoke/polling.mjs';
import { redactUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';
import { dimensionsHash } from '../src/services/aggregation/buckets.js';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('aggregate_forward_dimensions');
const signalKey = 'demo.aggregate.dimensions';
const startedAt = new Date().toISOString();
const subscriberUrl = process.env.HEADSUPP_SMOKE_WEBHOOK_URL || 'https://example.com/headsupp-aggregate-dimensions';
const now = new Date();
const closedBucketStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() - 2, 0, 0, 0)).toISOString();

function forwardWatchId() {
  return `${ids.watch}_aggregate_forward`;
}

async function insertAggregate({ label, dimensions, value }) {
  const hash = dimensionsHash(dimensions);
  const timestamp = new Date().toISOString();
  await client.d1Query(
    `INSERT INTO aggregates (
      id, workspace_id, channel_id, signal_id, signal_key, bucket_type, bucket_start_at,
      dimensions_hash, dimensions_json, last_event_context_json,
      sum_value, count_value, min_value, max_value, last_value, avg_value,
      first_event_at, last_event_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${ids.signal}:hour:${closedBucketStart}:${hash}`,
      ids.workspace,
      ids.channel,
      ids.signal,
      signalKey,
      'hour',
      closedBucketStart,
      hash,
      JSON.stringify(dimensions),
      JSON.stringify({
        fields: { label, region: dimensions.region, service: dimensions.service },
        cta: { label: 'View aggregate', url: `https://example.com/aggregates/${label}` },
      }),
      value,
      1,
      value,
      value,
      value,
      value,
      closedBucketStart,
      closedBucketStart,
      timestamp,
    ],
  );
  return hash;
}

async function insertWatch(filterDimensions) {
  const timestamp = new Date().toISOString();
  const id = forwardWatchId();
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
      'Dimensioned aggregate forward smoke',
      'AGGREGATE_FORWARD',
      JSON.stringify({
        bucket_type: 'hour',
        emit_after_grace_seconds: 0,
        subscriber_id: ids.subscriber,
        dimensions: filterDimensions,
        include: ['last_value', 'count_value', 'avg_value'],
      }),
      60,
      null,
      null,
      1,
      timestamp,
      timestamp,
    ],
  );
}

async function deliveryProof() {
  const result = await client.d1Query(
    `SELECT id, dimensions_hash, dimensions_json, payload_json, status
     FROM aggregate_deliveries
     WHERE subscriber_id = ?
     ORDER BY created_at DESC`,
    [ids.subscriber],
  );
  const rows = result?.results || [];
  return {
    aggregate_deliveries: rows.length,
    rows,
    payloads: rows.map((row) => JSON.parse(row.payload_json || '{}')),
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
  subscriberName: 'Dimensioned aggregate receiver',
  signalKey,
});
await client.d1Query('DELETE FROM watches WHERE id = ?', [ids.watch]);

const matchingHash = await insertAggregate({ label: 'us-api', dimensions: { region: 'us', service: 'api' }, value: 42 });
const skippedHash = await insertAggregate({ label: 'eu-api', dimensions: { region: 'eu', service: 'api' }, value: 84 });
await insertWatch({ region: 'us', service: 'api' });

const before = await deliveryProof();
const firstPass = await pollUntil({
  label: 'dimensioned aggregate-forward delivery',
  attempts: 40,
  intervalMs: 3000,
  check: deliveryProof,
  isReady: (proof) =>
    proof.aggregate_deliveries === 1 &&
    proof.rows[0]?.dimensions_hash === matchingHash &&
    proof.payloads[0]?.dedupe_key?.endsWith(`:${matchingHash}`) &&
    proof.payloads[0]?.dimensions?.region === 'us' &&
    proof.payloads[0]?.fields?.label === 'us-api' &&
    proof.payloads[0]?.cta?.url,
});

await sleep(70_000);
const secondPass = await deliveryProof();
if (secondPass.aggregate_deliveries !== firstPass.aggregate_deliveries) {
  throw new Error(`Second cron pass duplicated dimensioned aggregate delivery: ${JSON.stringify(secondPass)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      receiver: redactUrl(subscriberUrl),
      health: { status: health.status, app: health.app },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        signal_key: signalKey,
        watch_id: forwardWatchId(),
        matching_hash: matchingHash,
        skipped_hash: skippedHash,
      },
      counts: { before, first_pass: firstPass, second_pass: secondPass },
      assertions: {
        matched_only_filtered_dimension: firstPass.aggregate_deliveries === 1,
        payload_has_dimensions_hash: firstPass.payloads[0]?.dimensions_hash === matchingHash,
        payload_has_dedupe_key: Boolean(firstPass.payloads[0]?.dedupe_key),
        payload_preserves_fields: firstPass.payloads[0]?.fields?.label === 'us-api',
        payload_preserves_cta: Boolean(firstPass.payloads[0]?.cta?.url),
        no_duplicate_second_pass: secondPass.aggregate_deliveries === firstPass.aggregate_deliveries,
      },
    },
    null,
    2,
  ),
);
