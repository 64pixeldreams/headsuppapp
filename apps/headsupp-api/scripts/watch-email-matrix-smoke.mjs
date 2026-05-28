import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  provisionGenericScenario,
} from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { redactUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
const emailDestination = process.env.HEADSUPP_SMOKE_EMAIL_DESTINATION;
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_EMAIL_DESTINATION', emailDestination);

const client = createCloudflareClient(runtime);
const startedAt = new Date().toISOString();
const health = await checkHealth(runtime.baseUrl);

function minuteOffset(minutes) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

function recipientHint(value) {
  const text = String(value || '');
  return `${text.slice(0, 2)}***${text.includes('@') ? text.slice(text.indexOf('@')) : ''}`;
}

async function configureEmailSubscriber(ids, caseName) {
  await client.d1Query('UPDATE subscribers SET config_json = ?, destination_url_redacted = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify({
      template_id: caseName === 'forecast_template' ? 'forecast_alert_v1' : 'base_alert_v1',
      actions: ['snooze_1h', 'stop_watching'],
      labels: {
        title_template: `[Heads Up Smoke] ${caseName}: {value}`,
        summary_template: `[Heads Up Smoke] ${caseName} fired at {value}; threshold is {threshold}.`,
      },
    }),
    recipientHint(emailDestination),
    new Date().toISOString(),
    ids.subscriber,
  ]);
}

async function sentDeliveriesForChannel(ids) {
  const rows = await client.d1Query(
    `SELECT delivery.id, delivery.alert_id, delivery.status, delivery.attempt_count, delivery.response_code,
       delivery.response_body, delivery.updated_at, alert.watch_id, alert.severity, alert.summary_text
     FROM alert_deliveries delivery
     JOIN alerts alert ON alert.id = delivery.alert_id
     WHERE alert.channel_id = ? AND delivery.subscriber_id = ? AND delivery.status = 'sent'
     ORDER BY delivery.updated_at DESC`,
    [ids.channel, ids.subscriber],
  );
  return rows?.results || [];
}

async function insertWatchGroup(ids) {
  const now = new Date().toISOString();
  const groupId = `${ids.watch}_group`;
  await client.d1Query(
    `INSERT INTO watch_groups (
      id, watch_group_id, workspace_id, channel_id, signal_id, group_key, name,
      winner_policy, cooldown_scope, cooldown_seconds, recovery_json, config_json,
      enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      groupId,
      groupId,
      ids.workspace,
      ids.channel,
      ids.signal,
      'smoke_grouped_policy',
      'Smoke grouped warning critical',
      'highest_severity_wins',
      'group',
      0,
      null,
      '{}',
      1,
      now,
      now,
    ],
  );
  const bands = [
    ['warning', 'warning', 85],
    ['critical', 'critical', 70],
  ];
  for (const [bandKey, severity, threshold] of bands) {
    const watchId = `${ids.watch}_${bandKey}`;
    await client.d1Query(
      `INSERT INTO watches (
        id, watch_id, workspace_id, channel_id, signal_id, name, watch_type, config_json,
        cooldown_seconds, escalation_json, recovery_json, enabled, watch_group_id, band_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        watchId,
        watchId,
        ids.workspace,
        ids.channel,
        ids.signal,
        `Smoke grouped ${bandKey}`,
        'LAST_VALUE_LT',
        JSON.stringify({ threshold, severity, bucket_type: 'minute' }),
        0,
        null,
        null,
        1,
        groupId,
        bandKey,
        now,
        now,
      ],
    );
  }
}

async function runCase({ name, watchType, config, events, expectedSent = 1, grouped = false, template = 'base_alert_v1' }) {
  const ids = genericSmokeIds(`watch_email_${name}`);
  const signalKey = `smoke.email.${name}`;
  const setup = await provisionGenericScenario({
    client,
    ids,
    slackWebhookUrl: null,
    subscriberUrl: emailDestination,
    subscriberType: 'email',
    subscriberMode: 'alert',
    subscriberName: `[Heads Up Smoke] ${name}`,
    signalKey,
    watchName: `[Heads Up Smoke] ${name}`,
    watchType,
    watchConfig: config,
    cooldownSeconds: 0,
  });
  await configureEmailSubscriber(ids, template === 'forecast_alert_v1' ? 'forecast_template' : name);
  if (grouped) {
    await client.d1Query('DELETE FROM watches WHERE id = ?', [ids.watch]);
    await insertWatchGroup(ids);
  }

  const runId = `${ids.scenarioId}:${Date.now()}`;
  const accepted = await sendSignedEvents({
    baseUrl: runtime.baseUrl,
    connectorKey: setup.connectorKey,
    connectorSecret: setup.connectorSecret,
    events: events.map((event, index) =>
      buildMetricEvent({
        runId,
        name: `${name}:${index}`,
        signalKey,
        value: event.value,
        source: 'watch-email-matrix-smoke',
        occurredAt: event.occurredAt,
        fields: {
          smoke_case: name,
          forecast_id: `fc_${name}`,
          forecast_name: `[Heads Up Smoke] ${name}`,
          test: true,
          ...(event.fields || {}),
        },
        dimensions: {
          smoke_case: name,
          ...(event.dimensions || {}),
        },
        cta: {
          label: 'View smoke case',
          url: `https://example.com/heads-up-smoke/${name}`,
        },
      }),
    ),
  });

  const proof = await pollUntil({
    label: `${name} sent email deliveries`,
    attempts: 50,
    intervalMs: 3000,
    check: async () => sentDeliveriesForChannel(ids),
    isReady: (deliveries) => deliveries.length >= expectedSent,
  });

  return {
    name,
    watch_type: grouped ? 'watch_group:highest_severity_wins' : watchType,
    workspace_id: ids.workspace,
    channel_id: ids.channel,
    signal_key: signalKey,
    connector_key: setup.connectorKey,
    queued: accepted.queued,
    expected_sent: expectedSent,
    sent: proof.length,
    deliveries: proof.slice(0, expectedSent).map((delivery) => ({
      delivery_id: delivery.id,
      alert_id: delivery.alert_id,
      watch_id: delivery.watch_id,
      status: delivery.status,
      attempt_count: delivery.attempt_count,
      response_code: delivery.response_code,
      severity: delivery.severity,
    })),
  };
}

const previous = minuteOffset(-3);
const current = minuteOffset(-2);
const cases = [
  {
    name: 'last_value_gt',
    watchType: 'LAST_VALUE_GT',
    config: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
    events: [{ value: 15, occurredAt: current }],
  },
  {
    name: 'last_value_lt',
    watchType: 'LAST_VALUE_LT',
    config: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
    events: [{ value: 5, occurredAt: current }],
  },
  {
    name: 'window_sum_gt',
    watchType: 'WINDOW_SUM_GT',
    config: { threshold: 40, severity: 'warning', bucket_type: 'minute', window: { size: 2 } },
    events: [{ value: 25, occurredAt: current }, { value: 25, occurredAt: current }],
  },
  {
    name: 'window_count_gt',
    watchType: 'WINDOW_COUNT_GT',
    config: { threshold: 1, severity: 'warning', bucket_type: 'minute', window: { size: 2 } },
    events: [{ value: 1, occurredAt: current }, { value: 1, occurredAt: current }],
  },
  {
    name: 'delta_gt',
    watchType: 'DELTA_GT',
    config: { threshold: 5, severity: 'warning', bucket_type: 'minute' },
    events: [{ value: 10, occurredAt: previous }, { value: 25, occurredAt: current }],
  },
  {
    name: 'delta_lt',
    watchType: 'DELTA_LT',
    config: { threshold: -5, severity: 'warning', bucket_type: 'minute' },
    events: [{ value: 30, occurredAt: previous }, { value: 10, occurredAt: current }],
  },
  {
    name: 'percent_change_gt',
    watchType: 'PERCENT_CHANGE_GT',
    config: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
    events: [{ value: 10, occurredAt: previous }, { value: 25, occurredAt: current }],
  },
  {
    name: 'percent_change_lt',
    watchType: 'PERCENT_CHANGE_LT',
    config: { threshold: -50, severity: 'warning', bucket_type: 'minute' },
    events: [{ value: 30, occurredAt: previous }, { value: 10, occurredAt: current }],
  },
  {
    name: 'trend_up_gt',
    watchType: 'TREND_UP_GT',
    config: { threshold: 50, severity: 'warning', bucket_type: 'minute', window: { size: 2 }, field: 'last_value' },
    events: [{ value: 10, occurredAt: previous }, { value: 25, occurredAt: current }],
  },
  {
    name: 'trend_down_gt',
    watchType: 'TREND_DOWN_GT',
    config: { threshold: 50, severity: 'warning', bucket_type: 'minute', window: { size: 2 }, field: 'last_value' },
    events: [{ value: 30, occurredAt: previous }, { value: 10, occurredAt: current }],
  },
  {
    name: 'forecast_template',
    watchType: 'LAST_VALUE_LT',
    config: { threshold: 85, severity: 'critical', bucket_type: 'minute' },
    template: 'forecast_alert_v1',
    events: [{ value: 64, occurredAt: current, fields: { pace_percent: 64, status: 'critical' } }],
  },
  {
    name: 'grouped_winner',
    watchType: 'LAST_VALUE_LT',
    config: { threshold: 1, severity: 'warning', bucket_type: 'minute' },
    grouped: true,
    events: [{ value: 64, occurredAt: current }],
  },
];

const results = [];
for (const testCase of cases) {
  results.push(await runCase(testCase));
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      recipient_hint: recipientHint(emailDestination),
      health: { status: health.status, app: health.app },
      cases: results,
      expected_email_behavior: `${results.length} real smoke email deliveries to ${recipientHint(emailDestination)}.`,
    },
    null,
    2,
  ),
);
