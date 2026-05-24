import { buildAlert } from '../src/services/alerts/persistence.js';
import { eventToAggregateDeltas } from '../src/services/aggregation/buckets.js';
import { foldAggregateDeltas } from '../src/services/aggregation/fold-deltas.js';
import { createMemoryControlPlaneStore } from '../src/services/control-plane/kv-store.js';
import { createRawEventMessages } from '../src/services/ingest/raw-event-queue.js';
import { dispatchAlertDelivery, slackAlertPayload } from '../src/services/delivery/webhook.js';
import { createForeticForecastWatch } from '../src/services/foretic/create-forecast-watch.js';
import {
  buildForeticForecastStateEvent,
  buildSignedForeticIngestRequest,
} from '../src/services/foretic/forecast-state-event.js';
import { normalizeIncomingPayload } from '../src/services/ingest/event-validation.js';
import { verifyConnectorHmac } from '../src/services/connectors/hmac.js';

const slackWebhookUrl = process.env.HEADSUPP_SMOKE_SLACK_WEBHOOK_URL;
const shouldDispatchSlack = process.env.HEADSUPP_SMOKE_DISPATCH_SLACK === 'true';
const now = '2026-05-24T10:00:00.000Z';

function noSecret(value) {
  return String(value || '').replace(/(https:\/\/hooks\.slack\.com\/services\/[^/]+\/).+/, '$1...');
}

function fakeDb() {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

if (!slackWebhookUrl) {
  throw new Error('HEADSUPP_SMOKE_SLACK_WEBHOOK_URL is required.');
}

const store = createMemoryControlPlaneStore();
const setup = await createForeticForecastWatch({
  auth: {
    type: 'api',
    user_id: 'user:foretic-service',
    permissions: ['foretic:provision'],
  },
  input: {
    user_id: 'user:mkfoxvxgoyfbtd',
    forecast_id: 'oracle_forecast:mlfl1bfqrxnbk1',
    forecast_name: 'RB sales history (stripe)',
    slack_webhook_url: slackWebhookUrl,
    foretic_callback_url: 'https://api.foretic.io/heads-up/callback',
  },
  store,
  now,
  secretFactory: () => 'hu_sec_smoke_test_secret',
  baseUrl: 'https://headsupp-smoke.local',
});

if (!setup.ok) {
  throw new Error(`Provisioning failed: ${setup.code || 'UNKNOWN'}`);
}

const event = buildForeticForecastStateEvent({
  forecastId: 'oracle_forecast:mlfl1bfqrxnbk1',
  forecastName: 'RB sales history (stripe)',
  pacePercent: 84,
  occurredAt: now,
  ctaUrl: 'https://foretic.io/forecasts/oracle_forecast:mlfl1bfqrxnbk1',
});
const signedRequest = await buildSignedForeticIngestRequest({
  eventUrl: setup.event_url,
  connectorSecret: setup.connector.connector_secret,
  event,
  timestamp: now,
});
const verified = await verifyConnectorHmac({
  connector: {
    enabled: true,
    connector_secret: setup.connector.connector_secret,
  },
  timestamp: signedRequest.headers['X-HeadsUp-Timestamp'],
  signature: signedRequest.headers['X-HeadsUp-Signature'],
  rawBody: signedRequest.body,
  nowMs: Date.parse(now),
});
if (!verified.ok) {
  throw new Error(`Signed event failed verification: ${verified.code}`);
}

const normalized = normalizeIncomingPayload(JSON.parse(signedRequest.body));
if (!normalized.ok) {
  throw new Error(`Generated event failed ingest validation: ${normalized.code}`);
}

const rawMessages = createRawEventMessages({
  connector: {
    workspace_id: setup.workspace.workspace_id,
    channel_id: setup.channel.channel_id,
    connector_id: setup.connector.connector_id,
    connector_key: setup.connector.connector_key,
  },
  events: normalized.events,
  receivedAt: now,
});
const aggregateDeltas = rawMessages.flatMap((message) =>
  eventToAggregateDeltas({
    message,
    signal: {
      id: 'sig_foretic_smoke',
      signal_key: event.signal_key,
    },
    contract: {
      default_bucket_types: ['minute', 'hour'],
      dimensions: ['forecast_id', 'status'],
    },
    now,
  }),
);
const foldedDeltas = foldAggregateDeltas(aggregateDeltas);
const warningWatch = setup.watches.find((watch) => watch.watch_type === 'LAST_VALUE_LT' && watch.threshold === 85);
const alert = buildAlert({
  watch: {
    id: warningWatch.watch_id,
    workspace_id: setup.workspace.workspace_id,
    channel_id: setup.channel.channel_id,
    signal_id: 'sig_foretic_smoke',
    name: warningWatch.name,
    cooldown_seconds: warningWatch.cooldown_seconds,
  },
  evaluation: {
    threshold: warningWatch.threshold,
    cta: event.cta,
  },
  decision: {
    action: 'alert',
    severity: warningWatch.severity,
    current_value: event.value.num,
  },
  input: {
    signalId: 'sig_foretic_smoke',
    bucketType: 'minute',
    bucketStartAt: foldedDeltas[0].bucket_start_at,
  },
  now,
});
const delivery = {
  id: 'delivery_foretic_smoke_slack',
  destination_url: slackWebhookUrl,
  attempt_count: 0,
};
const subscriber = {
  subscriber_id: setup.subscribers.find((item) => item.subscriber_type === 'slack_webhook')?.subscriber_id,
  subscriber_type: 'slack_webhook',
};
const dispatch = await dispatchAlertDelivery({
  db: fakeDb(),
  delivery,
  alert,
  subscriber,
  fetchFn: shouldDispatchSlack ? fetch : async () => new Response('dry-run', { status: 200 }),
  now,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      slack_dispatch_enabled: shouldDispatchSlack,
      slack_destination: noSecret(slackWebhookUrl),
      provisioned: {
        workspace_id: setup.workspace.workspace_id,
        channel_id: setup.channel.channel_id,
        connector_key: setup.connector.connector_key,
        slack_subscriber_registered: setup.subscribers.some((item) => item.subscriber_type === 'slack_webhook'),
        aggregate_subscriber_registered: setup.subscribers.some((item) => item.mode === 'aggregate_forward'),
      },
      ingest: {
        hmac_verified: verified.ok,
        raw_messages: rawMessages.length,
        aggregate_deltas: aggregateDeltas.length,
        folded_deltas: foldedDeltas.length,
      },
      alert: {
        alert_id: alert.id,
        severity: alert.severity,
        slack_payload: slackAlertPayload(alert),
      },
      delivery: {
        status: dispatch.status,
        response_code: dispatch.response_code,
      },
    },
    null,
    2,
  ),
);
