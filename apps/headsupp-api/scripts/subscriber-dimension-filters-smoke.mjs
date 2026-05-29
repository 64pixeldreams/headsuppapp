import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { checkHealth, sendSignedEvents } from './smoke/events.mjs';
import { genericSmokeIds } from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { redactSecret, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

// Proves config.filters.dimensions scopes one shared channel by forecast_id.
// One signal, one EVENT_OCCURRENCE watch, two forecast-scoped subscribers: each
// recipient must receive only the alert for their forecast.

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('subscriber_dimension_filters');
const runId = `${ids.scenarioId}:${Date.now()}`;
const signalKey = 'forecast.goal.reached';
const connectorSecret = `${ids.scenarioId}-secret-not-production`;
const forecastA = 'forecast_dim_a';
const forecastB = 'forecast_dim_b';
const subA = `${ids.webhookSubscriber}_a`;
const subB = `${ids.webhookSubscriber}_b`;

async function cleanup() {
  const statements = [
    ['DELETE FROM alert_deliveries WHERE alert_id IN (SELECT id FROM alerts WHERE channel_id = ?)', [ids.channel]],
    ['DELETE FROM watch_occurrences WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM alerts WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watch_states WHERE watch_id IN (SELECT id FROM watches WHERE channel_id = ?)', [ids.channel]],
    ['DELETE FROM raw_event_dedupe WHERE idempotency_key LIKE ?', [`generic-smoke:${ids.scenarioId}:%`]],
    ['DELETE FROM subscribers WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watches WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM signals WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM connectors WHERE id = ? OR connector_key = ?', [ids.connector, ids.connectorKey]],
    ['DELETE FROM channels WHERE id = ?', [ids.channel]],
    ['DELETE FROM workspaces WHERE id = ?', [ids.workspace]],
  ];
  for (const [sql, params] of statements) await client.d1Query(sql, params);
}

async function seed() {
  const now = new Date().toISOString();
  await client.d1Query(
    `INSERT INTO workspaces (
      id, workspace_id, workspace_key, name, source_app, external_tenant_id, external_user_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.workspace, ids.workspace, `headsupp:${ids.scenarioId}`, `Smoke ${ids.scenarioId} Workspace`, 'headsupp-smoke', ids.scenarioId, `${ids.scenarioId}-user`, 'active', now, now],
  );
  await client.d1Query(
    `INSERT INTO channels (
      id, channel_id, workspace_id, name, channel_key, purpose, status, source_app,
      external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.channel, ids.channel, ids.workspace, `Smoke ${ids.scenarioId} Channel`, `headsupp:${ids.scenarioId}:channel`, 'Dimension filter smoke', 'active', 'headsupp-smoke', ids.scenarioId, `${ids.scenarioId}-user`, ids.scenarioId, now, now],
  );
  await client.d1Query(
    `INSERT INTO connectors (
      id, connector_id, workspace_id, channel_id, connector_type, connector_key, secret_hash,
      connector_secret, config_json, status, enabled, source_app, external_tenant_id,
      external_user_id, external_resource_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.connector, ids.connector, ids.workspace, ids.channel, 'webhook', ids.connectorKey, null, connectorSecret, '{}', 'active', 1, 'headsupp-smoke', ids.scenarioId, `${ids.scenarioId}-user`, ids.scenarioId, now, now],
  );
  await client.putKvJson(`control:connector_by_key:${ids.connectorKey}`, {
    id: ids.connector,
    connector_id: ids.connector,
    workspace_id: ids.workspace,
    channel_id: ids.channel,
    connector_type: 'webhook',
    connector_key: ids.connectorKey,
    connector_secret: connectorSecret,
    enabled: 1,
    status: 'active',
  });
  await client.d1Query(
    `INSERT INTO signals (
      id, signal_id, workspace_id, channel_id, signal_key, signal_type, value_mode, unit, description, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.signal, ids.signal, ids.workspace, ids.channel, signalKey, 'metric', 'last', null, signalKey, 'active', now, now],
  );
  await client.d1Query(
    `INSERT INTO watches (
      id, watch_id, workspace_id, channel_id, signal_id, watch_group_id, band_key, name, watch_type, config_json,
      cooldown_seconds, escalation_json, recovery_json, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.watch, ids.watch, ids.workspace, ids.channel, ids.signal, null, null, 'Goal reached occurrence', 'EVENT_OCCURRENCE', JSON.stringify({ event_type: 'goal_reached', dedupe_key_path: 'fields.goal_id', severity: 'success' }), 0, null, null, 1, now, now],
  );
  const subscribers = [
    [subA, 'Forecast A subscriber', { filters: { dimensions: { forecast_id: [forecastA] } } }],
    [subB, 'Forecast B subscriber', { filters: { dimensions: { forecast_id: [forecastB] } } }],
  ];
  for (const [subscriberId, name, config] of subscribers) {
    await client.d1Query(
      `INSERT INTO subscribers (
        id, subscriber_id, workspace_id, channel_id, subscriber_type, name, destination_url, normalized_destination,
        destination_url_redacted, secret_hash, mode, config_json, enabled, subscriber_scope, source_app,
        external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [subscriberId, subscriberId, ids.workspace, ids.channel, 'webhook', name, 'smoke://status/200', 'smoke://status/200', 'smoke://status/200', null, 'alert', JSON.stringify(config), 1, 'channel', 'headsupp-smoke', ids.scenarioId, `${ids.scenarioId}-user`, ids.scenarioId, now, now],
    );
  }
}

function goalEvent({ forecastId, goalId }) {
  return {
    idempotency_key: `generic-smoke:${runId}:${goalId}`,
    signal_key: signalKey,
    occurred_at: new Date().toISOString(),
    value: { num: null },
    fields: {
      source: 'subscriber-dimension-filters-smoke',
      event_type: 'goal_reached',
      forecast_id: forecastId,
      goal_id: goalId,
      notification: { title: 'Goal reached', summary: `Goal reached for ${forecastId}.` },
    },
  };
}

async function deliverySubscriberIds(forecastId) {
  const rows = await client.d1Query(
    `SELECT d.subscriber_id AS subscriber_id
     FROM alert_deliveries d
     JOIN alerts a ON a.id = d.alert_id
     WHERE a.channel_id = ? AND a.payload_json LIKE ?
     ORDER BY d.subscriber_id ASC`,
    [ids.channel, `%${forecastId}%`],
  );
  return rows.results.map((row) => row.subscriber_id);
}

await cleanup();
const health = await checkHealth(runtime.baseUrl);
await seed();

await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: ids.connectorKey,
  connectorSecret,
  events: [
    goalEvent({ forecastId: forecastA, goalId: 'goal_dim_a' }),
    goalEvent({ forecastId: forecastB, goalId: 'goal_dim_b' }),
  ],
});

const result = await pollUntil({
  label: 'dimension-scoped deliveries',
  attempts: 40,
  intervalMs: 3000,
  check: async () => ({
    a: await deliverySubscriberIds(forecastA),
    b: await deliverySubscriberIds(forecastB),
  }),
  isReady: ({ a, b }) => a.length === 1 && b.length === 1,
});

if (result.a[0] !== subA) throw new Error(`Forecast A alert delivered to unexpected subscriber: ${JSON.stringify(result.a)}`);
if (result.b[0] !== subB) throw new Error(`Forecast B alert delivered to unexpected subscriber: ${JSON.stringify(result.b)}`);

console.log(
  JSON.stringify(
    {
      ok: true,
      base_url: runtime.baseUrl,
      connector_key: ids.connectorKey,
      connector_secret: redactSecret(connectorSecret),
      forecast_a_deliveries: result.a,
      forecast_b_deliveries: result.b,
      health: { status: health.status, app: health.app },
    },
    null,
    2,
  ),
);
