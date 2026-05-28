import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  latestAlert,
  latestDelivery,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { redactUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('delivery_retry');
const signalKey = 'demo.retry';
const startedAt = new Date().toISOString();
const transientFailureUrl = process.env.HEADSUPP_SMOKE_RETRY_FAIL_URL || 'smoke://status/503';
const permanentFailureUrl = process.env.HEADSUPP_SMOKE_PERMANENT_FAIL_URL || 'smoke://status/404';
const successUrl = process.env.HEADSUPP_SMOKE_RETRY_SUCCESS_URL || 'smoke://status/200';

async function triggerAlert({ runId, value, idempotencySuffix }) {
  return sendSignedEvents({
    baseUrl: runtime.baseUrl,
    connectorKey: setup.connectorKey,
    connectorSecret: setup.connectorSecret,
    events: [
      buildMetricEvent({
        runId,
        name: idempotencySuffix,
        signalKey,
        value,
        source: 'delivery-retry-smoke',
      }),
    ],
  });
}

async function makeRetryDue(deliveryId) {
  await client.d1Query('UPDATE alert_deliveries SET next_retry_at = ? WHERE id = ?', [
    new Date(Date.now() - 1000).toISOString(),
    deliveryId,
  ]);
}

async function updateDeliveryDestination(url) {
  await client.d1Query(
    'UPDATE subscribers SET destination_url = ?, destination_url_redacted = ? WHERE id = ?',
    [url, redactUrl(url), ids.subscriber],
  );
  await client.d1Query(
    "UPDATE alert_deliveries SET destination_url = ? WHERE subscriber_id = ? AND status = 'retrying'",
    [url, ids.subscriber],
  );
}

const health = await checkHealth(runtime.baseUrl);
const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl: transientFailureUrl,
  subscriberType: 'webhook',
  subscriberMode: 'alert',
  subscriberName: 'Delivery retry smoke receiver',
  signalKey,
  watchName: 'Delivery retry smoke metric high',
  watchConfig: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
  cooldownSeconds: 0,
});

const before = await smokeCounts(client, ids);
const transientAccepted = await triggerAlert({
  runId: `${ids.scenarioId}:transient:${Date.now()}`,
  value: 15,
  idempotencySuffix: 'transient',
});
const retrying = await pollUntil({
  label: 'transient retrying delivery',
  attempts: 30,
  intervalMs: 3000,
  check: async () => ({
    counts: await smokeCounts(client, ids),
    alert: await latestAlert(client, ids),
    delivery: await latestDelivery(client, ids),
  }),
  isReady: ({ delivery }) => delivery?.status === 'retrying',
});

const alertId = retrying.alert?.id;
const deliveryId = retrying.delivery?.id;
await updateDeliveryDestination(successUrl);
await makeRetryDue(deliveryId);
const alertCountBeforeRetry = retrying.counts.alerts;
const sent = await pollUntil({
  label: 'retry delivery sent',
  attempts: 40,
  intervalMs: 3000,
  check: async () => ({
    counts: await smokeCounts(client, ids),
    delivery: await latestDelivery(client, ids),
  }),
  isReady: ({ delivery }) => delivery?.id === deliveryId && delivery?.status === 'sent',
});

if (sent.counts.alerts !== alertCountBeforeRetry) {
  throw new Error(`Retry created duplicate alert rows: ${JSON.stringify(sent.counts)}`);
}

await updateDeliveryDestination(permanentFailureUrl);
await triggerAlert({
  runId: `${ids.scenarioId}:permanent:${Date.now()}`,
  value: 16,
  idempotencySuffix: 'permanent',
});
const permanent = await pollUntil({
  label: 'permanent failed delivery',
  attempts: 30,
  intervalMs: 3000,
  check: async () => ({
    counts: await smokeCounts(client, ids),
    delivery: await latestDelivery(client, ids),
  }),
  isReady: ({ delivery }) => delivery?.status === 'failed' && Number(delivery?.response_code) === 404,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      endpoints: {
        transient_failure: redactUrl(transientFailureUrl),
        retry_success: redactUrl(successUrl),
        permanent_failure: redactUrl(permanentFailureUrl),
      },
      health: {
        status: health.status,
        app: health.app,
      },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        connector_key: setup.connectorKey,
        signal_key: signalKey,
        watch: 'LAST_VALUE_GT threshold 10',
      },
      ingest: {
        transient_events_queued: transientAccepted.queued,
      },
      assertions: {
        transient_status: retrying.delivery.status,
        retry_status: sent.delivery.status,
        retry_attempt_count: sent.delivery.attempt_count,
        permanent_status: permanent.delivery.status,
        permanent_response_code: permanent.delivery.response_code,
        same_alert_id_retried: alertId === retrying.alert?.id,
        no_duplicate_alert_on_retry: sent.counts.alerts === alertCountBeforeRetry,
      },
      counts: {
        before,
        after_retry: sent.counts,
        after_permanent: permanent.counts,
      },
    },
    null,
    2,
  ),
);
