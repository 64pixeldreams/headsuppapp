import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  aggregateCounts,
  deliveryCountsBySubscriber,
  genericSmokeIds,
  latestAlert,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { redactUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const tenantA = genericSmokeIds('tenant_isolation_a');
const tenantB = genericSmokeIds('tenant_isolation_b');
const signalKey = 'demo.shared.metric';
const subscriberUrl = process.env.HEADSUPP_SMOKE_WEBHOOK_URL || 'https://example.com/headsupp-tenant-smoke';
const startedAt = new Date().toISOString();

async function provisionTenant(ids, label) {
  return provisionGenericScenario({
    client,
    ids,
    slackWebhookUrl: null,
    subscriberUrl,
    subscriberType: 'webhook',
    subscriberMode: 'alert',
    subscriberName: `Tenant isolation ${label} receiver`,
    signalKey,
    watchName: `Tenant isolation ${label} metric high`,
    watchConfig: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
    cooldownSeconds: 0,
  });
}

async function aggregateLastValue(ids) {
  const row = await client.d1First(
    'SELECT last_value FROM aggregates WHERE signal_id = ? ORDER BY updated_at DESC LIMIT 1',
    [ids.signal],
  );
  return row?.last_value === null || row?.last_value === undefined ? null : Number(row.last_value);
}

async function tenantProof() {
  const [countsA, countsB, deliveriesA, deliveriesB, aggregateCountA, aggregateCountB, lastValueA, lastValueB] =
    await Promise.all([
      smokeCounts(client, tenantA),
      smokeCounts(client, tenantB),
      deliveryCountsBySubscriber(client, tenantA.subscriber),
      deliveryCountsBySubscriber(client, tenantB.subscriber),
      aggregateCounts(client, tenantA),
      aggregateCounts(client, tenantB),
      aggregateLastValue(tenantA),
      aggregateLastValue(tenantB),
    ]);
  return {
    tenant_a: { counts: countsA, deliveries: deliveriesA, aggregate_count: aggregateCountA, last_value: lastValueA },
    tenant_b: { counts: countsB, deliveries: deliveriesB, aggregate_count: aggregateCountB, last_value: lastValueB },
  };
}

const health = await checkHealth(runtime.baseUrl);
const setupA = await provisionTenant(tenantA, 'A');
const setupB = await provisionTenant(tenantB, 'B');
const before = await tenantProof();
const runId = `tenant-isolation:${Date.now()}`;

const acceptedA = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setupA.connectorKey,
  connectorSecret: setupA.connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'tenant-a-trigger',
      signalKey,
      value: 15,
      source: 'tenant-isolation-smoke',
    }),
  ],
});

const acceptedB = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setupB.connectorKey,
  connectorSecret: setupB.connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'tenant-b-normal',
      signalKey,
      value: 5,
      source: 'tenant-isolation-smoke',
    }),
  ],
});

const proof = await pollUntil({
  label: 'tenant isolation state',
  attempts: 30,
  intervalMs: 3000,
  check: tenantProof,
  isReady: (state) =>
    state.tenant_a.counts.alerts === 1 &&
    state.tenant_a.counts.deliveries === 1 &&
    state.tenant_a.aggregate_count === 1 &&
    state.tenant_a.last_value === 15 &&
    state.tenant_b.counts.alerts === 0 &&
    state.tenant_b.counts.deliveries === 0 &&
    state.tenant_b.aggregate_count === 1 &&
    state.tenant_b.last_value === 5,
});

const alertA = await latestAlert(client, tenantA);
const alertB = await latestAlert(client, tenantB);

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
        same_signal_key: signalKey,
        tenant_a: {
          workspace_id: tenantA.workspace,
          channel_id: tenantA.channel,
          connector_key: setupA.connectorKey,
        },
        tenant_b: {
          workspace_id: tenantB.workspace,
          channel_id: tenantB.channel,
          connector_key: setupB.connectorKey,
        },
      },
      ingest: {
        tenant_a_events_queued: acceptedA.queued,
        tenant_b_events_queued: acceptedB.queued,
      },
      assertions: {
        tenant_a_alerted: proof.tenant_a.counts.alerts === 1,
        tenant_b_not_alerted: proof.tenant_b.counts.alerts === 0,
        tenant_a_delivery_only: proof.tenant_a.counts.deliveries === 1 && proof.tenant_b.counts.deliveries === 0,
        tenant_a_last_value: proof.tenant_a.last_value,
        tenant_b_last_value: proof.tenant_b.last_value,
        no_alert_leak: !alertB,
      },
      counts: {
        before,
        after: proof,
      },
      latest_alerts: {
        tenant_a: alertA,
        tenant_b: alertB,
      },
    },
    null,
    2,
  ),
);
