import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import { genericSmokeIds, provisionGenericScenario } from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { redactUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('advanced_watches');
const signalKey = 'demo.advanced.metric';
const startedAt = new Date().toISOString();
const subscriberUrl = process.env.HEADSUPP_SMOKE_WEBHOOK_URL || 'https://example.com/headsupp-advanced-watches';
const runId = `${ids.scenarioId}:${Date.now()}`;
const now = new Date();
const previousMinute = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
const currentMinute = new Date(now.getTime() - 60 * 1000).toISOString();

function watchId(suffix) {
  return `${ids.watch}_${suffix}`;
}

async function insertWatch({ suffix, name, type, config, cooldownSeconds = 0 }) {
  const timestamp = new Date().toISOString();
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

async function alertCountsByWatch() {
  const result = await client.d1Query(
    `SELECT watch_id, COUNT(*) AS count
     FROM alerts
     WHERE channel_id = ?
     GROUP BY watch_id`,
    [ids.channel],
  );
  const counts = Object.fromEntries((result?.results || []).map((row) => [row.watch_id, Number(row.count || 0)]));
  const stateResult = await client.d1Query('SELECT watch_id, last_evaluated_at FROM watch_states WHERE watch_id LIKE ?', [
    `${ids.watch}_%`,
  ]);
  const states = Object.fromEntries((stateResult?.results || []).map((row) => [row.watch_id, row.last_evaluated_at]));
  return { counts, states };
}

const health = await checkHealth(runtime.baseUrl);
const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl,
  subscriberType: 'webhook',
  subscriberMode: 'alert',
  subscriberName: 'Advanced watches smoke receiver',
  signalKey,
  watchName: 'Advanced watches unused threshold',
  cooldownSeconds: 0,
});
await client.d1Query('DELETE FROM watches WHERE id = ?', [ids.watch]);

await insertWatch({
  suffix: 'window_avg',
  name: 'Advanced window average high',
  type: 'WINDOW_AVG_GT',
  config: { threshold: 15, severity: 'warning', bucket_type: 'minute', window: { size: 3 } },
});
await insertWatch({
  suffix: 'delta',
  name: 'Advanced delta high',
  type: 'DELTA_GT',
  config: { threshold: 5, severity: 'warning', bucket_type: 'minute' },
});
await insertWatch({
  suffix: 'percent_change',
  name: 'Advanced percent change high',
  type: 'PERCENT_CHANGE_GT',
  config: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
});
await insertWatch({
  suffix: 'ratio',
  name: 'Advanced previous period ratio high',
  type: 'PREVIOUS_PERIOD_RATIO_GT',
  config: { threshold: 1.5, severity: 'warning', bucket_type: 'minute' },
});
await insertWatch({
  suffix: 'spike',
  name: 'Advanced spike high',
  type: 'SPIKE_GT',
  config: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
});
await insertWatch({
  suffix: 'trend_up',
  name: 'Advanced form views trending up',
  type: 'TREND_UP_GT',
  config: { threshold: 50, severity: 'warning', bucket_type: 'minute', window: { size: 2 }, field: 'last_value' },
});
await insertWatch({
  suffix: 'reminder',
  name: 'Advanced reminder due',
  type: 'REMINDER_DUE',
  config: {
    due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    lead: { unit: 'hour', count: 2 },
    expires_after_seconds: 7200,
    severity: 'warning',
    label: 'Smoke reminder',
  },
});
await insertWatch({
  suffix: 'recurring_expectation',
  name: 'Advanced recurring expectation v2',
  type: 'MISSING_EXPECTED',
  config: {
    expected_every: { unit: 'minute', count: 1 },
    minimum_count: 1,
    value_range: { field: 'sum', min: 100 },
    severity: 'warning',
    bucket_type: 'minute',
  },
});
await insertWatch({
  suffix: 'rich_digest',
  name: 'Advanced rich weekly digest',
  type: 'DIGEST',
  config: {
    schedule: 'weekly',
    signal_ids: [ids.signal],
    include: ['sum', 'count', 'avg', 'last'],
    severity: 'info',
  },
});

const before = await alertCountsByWatch();
await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'previous-period',
      signalKey,
      value: 10,
      source: 'advanced-watches-smoke',
      occurredAt: previousMinute,
    }),
  ],
});
const triggerAccepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'current-period-a',
      signalKey,
      value: 25,
      source: 'advanced-watches-smoke',
      occurredAt: currentMinute,
    }),
    buildMetricEvent({
      runId,
      name: 'current-period-b',
      signalKey,
      value: 30,
      source: 'advanced-watches-smoke',
      occurredAt: currentMinute,
    }),
  ],
});

const expectedWatchIds = [
  watchId('window_avg'),
  watchId('delta'),
  watchId('percent_change'),
  watchId('ratio'),
  watchId('spike'),
  watchId('trend_up'),
  watchId('reminder'),
  watchId('recurring_expectation'),
  watchId('rich_digest'),
];

const proof = await pollUntil({
  label: 'advanced watch alerts',
  attempts: 50,
  intervalMs: 3000,
  check: alertCountsByWatch,
  isReady: (state) => expectedWatchIds.every((id) => Number(state.counts[id] || 0) >= 1),
});

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
        connector_key: setup.connectorKey,
        signal_key: signalKey,
        watch_ids: expectedWatchIds,
      },
      ingest: {
        trigger_events_queued: triggerAccepted.queued,
      },
      counts: { before, after: proof },
    },
    null,
    2,
  ),
);
