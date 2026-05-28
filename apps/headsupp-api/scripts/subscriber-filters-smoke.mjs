import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import { genericSmokeIds } from './smoke/generic-provisioning.mjs';
import { pollUntil, sleep } from './smoke/polling.mjs';
import { redactSecret, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('subscriber_filters');
const runId = `${ids.scenarioId}:${Date.now()}`;
const paceSignal = 'forecast.revenue.pace';
const goalSignal = 'forecast.goal.risk';
const connectorSecret = `${ids.scenarioId}-secret-not-production`;

async function cleanup() {
  const statements = [
    ['DELETE FROM alert_deliveries WHERE alert_id IN (SELECT id FROM alerts WHERE channel_id = ?)', [ids.channel]],
    ['DELETE FROM alerts WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watch_group_states WHERE watch_group_id IN (SELECT id FROM watch_groups WHERE channel_id = ?)', [ids.channel]],
    ['DELETE FROM watch_states WHERE watch_id IN (SELECT id FROM watches WHERE channel_id = ?)', [ids.channel]],
    ['DELETE FROM aggregates WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM raw_event_dedupe WHERE idempotency_key LIKE ?', [`generic-smoke:${runId.split(':')[0]}:%`]],
    ['DELETE FROM subscribers WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watches WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watch_groups WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM signals WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM connectors WHERE id = ? OR connector_key = ?', [ids.connector, ids.connectorKey]],
    ['DELETE FROM channels WHERE id = ?', [ids.channel]],
    ['DELETE FROM workspaces WHERE id = ?', [ids.workspace]],
  ];
  for (const [sql, params] of statements) await client.d1Query(sql, params);
}

async function seedScenario(goalSignals = [goalSignal]) {
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
    [ids.channel, ids.channel, ids.workspace, `Smoke ${ids.scenarioId} Channel`, `headsupp:${ids.scenarioId}:channel`, 'Subscriber filter smoke', 'active', 'headsupp-smoke', ids.scenarioId, `${ids.scenarioId}-user`, ids.scenarioId, now, now],
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
  for (const [signalId, signalKey] of [[`${ids.signal}_pace`, paceSignal], [`${ids.signal}_goal`, goalSignal]]) {
    await client.d1Query(
      `INSERT INTO signals (
        id, signal_id, workspace_id, channel_id, signal_key, signal_type, value_mode, unit, description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [signalId, signalId, ids.workspace, ids.channel, signalKey, 'metric', 'last', null, signalKey, 'active', now, now],
    );
  }
  for (const [watchId, signalId, name] of [[`${ids.watch}_pace`, `${ids.signal}_pace`, 'Pace high'], [`${ids.watch}_goal`, `${ids.signal}_goal`, 'Goal high']]) {
    await client.d1Query(
      `INSERT INTO watches (
        id, watch_id, workspace_id, channel_id, signal_id, watch_group_id, band_key, name, watch_type, config_json,
        cooldown_seconds, escalation_json, recovery_json, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [watchId, watchId, ids.workspace, ids.channel, signalId, null, null, name, 'LAST_VALUE_GT', JSON.stringify({ threshold: 10, severity: 'warning', bucket_type: 'minute' }), 1, null, null, 1, now, now],
    );
  }
  const subscribers = [
    [`${ids.webhookSubscriber}_pace`, 'Pace subscriber', 'https://example.com/pace', { filters: { signal_keys: [paceSignal] } }],
    [`${ids.webhookSubscriber}_goal`, 'Goal subscriber', 'https://example.com/goal', { filters: { signal_keys: goalSignals } }],
    [`${ids.webhookSubscriber}_all`, 'All subscriber', 'https://example.com/all', {}],
  ];
  for (const [subscriberId, name, url, config] of subscribers) {
    await client.d1Query(
      `INSERT INTO subscribers (
        id, subscriber_id, workspace_id, channel_id, subscriber_type, name, destination_url, normalized_destination,
        destination_url_redacted, secret_hash, mode, config_json, enabled, subscriber_scope, source_app,
        external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [subscriberId, subscriberId, ids.workspace, ids.channel, 'webhook', name, url, url, `${url}/...`, null, 'alert', JSON.stringify(config), 1, 'channel', 'headsupp-smoke', ids.scenarioId, `${ids.scenarioId}-user`, ids.scenarioId, now, now],
    );
  }
}

async function updateGoalSubscriberFilters(goalSignals) {
  await client.d1Query(
    'UPDATE subscribers SET config_json = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify({ filters: { signal_keys: goalSignals } }), new Date().toISOString(), `${ids.webhookSubscriber}_goal`],
  );
}

async function latestAlertForSignal(signalId) {
  return client.d1First(
    `SELECT id, signal_id, triggered_at
     FROM alerts
     WHERE channel_id = ? AND signal_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [ids.channel, signalId],
  );
}

async function deliverySubscriberIds(alertId) {
  const rows = await client.d1Query(
    `SELECT subscriber_id
     FROM alert_deliveries
     WHERE alert_id = ?
     ORDER BY subscriber_id ASC`,
    [alertId],
  );
  return rows.results.map((row) => row.subscriber_id);
}

await cleanup();
const health = await checkHealth(runtime.baseUrl);
await seedScenario();

await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: ids.connectorKey,
  connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'pace-first',
      signalKey: paceSignal,
      value: 12,
      source: 'subscriber-filters-smoke',
    }),
  ],
});

const firstAlert = await pollUntil({
  label: 'first pace filtered delivery',
  check: async () => latestAlertForSignal(`${ids.signal}_pace`),
  isReady: Boolean,
});
const firstDeliveries = await deliverySubscriberIds(firstAlert.id);
const expectedFirst = [`${ids.webhookSubscriber}_all`, `${ids.webhookSubscriber}_pace`].sort();
if (JSON.stringify(firstDeliveries) !== JSON.stringify(expectedFirst)) {
  throw new Error(`Unexpected first delivery subscribers: ${JSON.stringify(firstDeliveries)}`);
}

await updateGoalSubscriberFilters([paceSignal, goalSignal]);

await sleep(2000);
await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: ids.connectorKey,
  connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'pace-after-upsert',
      signalKey: paceSignal,
      value: 13,
      source: 'subscriber-filters-smoke',
    }),
  ],
});

const secondAlert = await pollUntil({
  label: 'second pace filtered delivery after upsert',
  check: async () => {
    const alert = await latestAlertForSignal(`${ids.signal}_pace`);
    if (alert?.id === firstAlert.id) return null;
    return alert;
  },
  isReady: Boolean,
});
const secondDeliveries = await deliverySubscriberIds(secondAlert.id);
const expectedSecond = [`${ids.webhookSubscriber}_all`, `${ids.webhookSubscriber}_goal`, `${ids.webhookSubscriber}_pace`].sort();
if (JSON.stringify(secondDeliveries) !== JSON.stringify(expectedSecond)) {
  throw new Error(`Unexpected second delivery subscribers: ${JSON.stringify(secondDeliveries)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      base_url: runtime.baseUrl,
      connector_key: ids.connectorKey,
      connector_secret: redactSecret(connectorSecret),
      first_deliveries: firstDeliveries,
      second_deliveries: secondDeliveries,
      updated_goal_filter: [paceSignal, goalSignal],
      health: { status: health.status, app: health.app },
    },
    null,
    2,
  ),
);
