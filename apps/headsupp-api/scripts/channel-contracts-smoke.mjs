import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { postFunction } from './smoke/admin-api.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import { genericSmokeIds, latestAlert, provisionGenericScenario } from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('channel_contracts');
const signalKey = 'demo.contract.metric';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;
const now = new Date().toISOString();

async function readViaApi(action, payload) {
  if (!runtime.serviceApiKey) return null;
  return postFunction({
    baseUrl: runtime.baseUrl,
    apiKey: runtime.serviceApiKey,
    action,
    payload,
  });
}

async function contractProof() {
  const [contract, signalContract, templates, state, alerts, timeline] = await Promise.all([
    client.d1First('SELECT * FROM channel_contracts WHERE id = ? LIMIT 1', [ids.channelContract]),
    client.d1First('SELECT * FROM signal_contracts WHERE signal_id = ? LIMIT 1', [ids.signal]),
    client.d1First('SELECT COUNT(*) AS count FROM watches WHERE channel_id = ? AND id LIKE ?', [ids.channel, `${ids.watch}_template_%`]),
    client.d1First('SELECT * FROM watch_states WHERE watch_id = ? LIMIT 1', [ids.watch]),
    readViaApi('admin.listChannelAlerts', { workspace_id: ids.workspace, channel_id: ids.channel, limit: 10 }),
    readViaApi('admin.listAlertTimeline', { workspace_id: ids.workspace, channel_id: ids.channel, limit: 10 }),
  ]);
  return {
    contract: contract
      ? {
          default_dimensions: JSON.parse(contract.default_dimensions_json || '[]'),
          cta_policy: JSON.parse(contract.cta_policy_json || '{}'),
        }
      : null,
    signal_contract: signalContract ? JSON.parse(signalContract.contract_json || '{}') : null,
    materialized_template_watches: Number(templates?.count || 0),
    watch_state_updated: Boolean(state?.last_evaluated_at),
    api_reads_used: Boolean(runtime.serviceApiKey),
    api_alerts_shape_ok: !alerts || Array.isArray(alerts.alerts),
    api_timeline_shape_ok: !timeline || Array.isArray(timeline.timeline),
  };
}

const health = await checkHealth(runtime.baseUrl);
const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl: process.env.HEADSUPP_SMOKE_WEBHOOK_URL || 'https://example.com/channel-contracts-smoke',
  subscriberType: 'webhook',
  subscriberMode: 'alert',
  subscriberName: 'Channel contracts smoke receiver',
  signalKey,
  watchName: 'Channel contracts quiet watch',
  watchConfig: { threshold: 100, severity: 'warning', bucket_type: 'minute' },
});

await client.d1Query(
  `INSERT INTO channel_contracts (
    id, channel_contract_id, workspace_id, channel_id, version, status, purpose,
    expected_signal_types_json, default_dimensions_json, default_watch_templates_json, cta_policy_json,
    source_app, external_tenant_id, external_user_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    ids.channelContract,
    ids.channelContract,
    ids.workspace,
    ids.channel,
    1,
    'active',
    'Generic contract smoke',
    JSON.stringify(['metric']),
    JSON.stringify(['region', 'service']),
    JSON.stringify([{ name: 'Template high value', watch_type: 'LAST_VALUE_GT', config: { threshold: 100 } }]),
    JSON.stringify({ required: true, kind: 'review' }),
    'headsupp-smoke',
    ids.scenarioId,
    `${ids.scenarioId}-user`,
    now,
    now,
  ],
);
await client.d1Query('UPDATE signal_contracts SET contract_json = ?, updated_at = ? WHERE signal_id = ?', [
  JSON.stringify({
    dimensions: ['region', 'service'],
    cta_policy: { required: true, kind: 'review' },
    default_bucket_types: ['minute', 'hour', 'day', 'week'],
  }),
  now,
  ids.signal,
]);
await client.d1Query(
  `INSERT INTO watches (
    id, watch_id, workspace_id, channel_id, signal_id, name, watch_type, config_json,
    cooldown_seconds, escalation_json, recovery_json, enabled, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    `${ids.watch}_template_high`,
    `${ids.watch}_template_high`,
    ids.workspace,
    ids.channel,
    ids.signal,
    'Template high value',
    'LAST_VALUE_GT',
    JSON.stringify({ threshold: 100, severity: 'warning', bucket_type: 'minute' }),
    60,
    null,
    null,
    1,
    now,
    now,
  ],
);

const accepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'quiet-contract-event',
      signalKey,
      value: 10,
      source: 'channel-contracts-smoke',
      fields: { region: 'us', service: 'api' },
      cta: { label: 'Review metric', url: 'https://example.com/metrics/channel-contracts' },
    }),
  ],
});

const proof = await pollUntil({
  label: 'channel contract watch state',
  attempts: 30,
  intervalMs: 3000,
  check: contractProof,
  isReady: (state) =>
    state.contract?.default_dimensions?.includes('region') &&
    state.signal_contract?.dimensions?.includes('service') &&
    state.materialized_template_watches >= 1 &&
    state.watch_state_updated,
});

const alert = await latestAlert(client, ids);
if (alert) throw new Error(`Quiet channel contract event created an alert: ${JSON.stringify(alert)}`);

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
      },
      ingest: { queued: accepted.queued },
      proof,
    },
    null,
    2,
  ),
);
