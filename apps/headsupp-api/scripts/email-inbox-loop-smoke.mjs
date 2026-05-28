import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import { genericSmokeIds, provisionGenericScenario } from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
const emailDestination = process.env.HEADSUPP_SMOKE_INBOX_EMAIL || 'tester@aibox.headsupp.io';
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const runId = `email-inbox-loop:${Date.now()}`;

function minuteOffset(minutes) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

function recipientHint(value) {
  const text = String(value || '');
  return `${text.slice(0, 2)}***${text.includes('@') ? text.slice(text.indexOf('@')) : ''}`;
}

async function configureEmailTestSubscriber(ids, testConfig) {
  await client.d1Query('UPDATE subscribers SET config_json = ?, destination_url_redacted = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify({
      template_id: 'base_alert_v1',
      email_test: {
        enabled: true,
        ...testConfig,
      },
    }),
    recipientHint(emailDestination),
    new Date().toISOString(),
    ids.subscriber,
  ]);
}

async function testedMessages(caseRunId, caseId) {
  const rows = await client.d1Query(
    `SELECT id, run_id, case_id, alert_id, delivery_id, status, failure_reason, received_at, tested_at
     FROM email_test_messages
     WHERE run_id = ? AND case_id = ?
     ORDER BY updated_at DESC`,
    [caseRunId, caseId],
  );
  return rows?.results || [];
}

function watchId(ids, suffix) {
  return `${ids.watch}_${suffix}`;
}

async function insertScheduledWatch(ids, { suffix, type, config }) {
  const now = new Date().toISOString();
  const id = watchId(ids, suffix);
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
      `[Heads Up Inbox Smoke] ${type}`,
      type,
      JSON.stringify(config),
      0,
      null,
      null,
      1,
      now,
      now,
    ],
  );
}

async function insertScheduledAggregate(ids, signalKey) {
  const bucketStart = new Date(Date.now() - 10 * 60_000).toISOString();
  const now = new Date().toISOString();
  await client.d1Query(
    `INSERT INTO aggregates (
      id, workspace_id, channel_id, signal_id, signal_key, bucket_type, bucket_start_at,
      dimensions_hash, dimensions_json, sum_value, count_value, min_value, max_value,
      last_value, avg_value, first_event_at, last_event_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${ids.signal}:minute:${bucketStart}`,
      ids.workspace,
      ids.channel,
      ids.signal,
      signalKey,
      'minute',
      bucketStart,
      'd0',
      '{}',
      42,
      1,
      42,
      42,
      42,
      42,
      bucketStart,
      bucketStart,
      now,
    ],
  );
}

async function disableScheduledProof(ids) {
  const now = new Date().toISOString();
  await client.d1Query('UPDATE watches SET enabled = 0, updated_at = ? WHERE channel_id = ?', [now, ids.channel]);
  await client.d1Query('UPDATE subscribers SET enabled = 0, updated_at = ? WHERE channel_id = ?', [now, ids.channel]);
  await client.d1Query(
    `UPDATE alert_deliveries
     SET status = 'ignored', updated_at = ?
     WHERE alert_id IN (SELECT id FROM alerts WHERE channel_id = ?)
       AND status IN ('pending', 'retrying')`,
    [now, ids.channel],
  );
}

async function runCase({ name, watchType, config, events }) {
  const ids = genericSmokeIds(`email_inbox_${name}`);
  const signalKey = `smoke.email.inbox.${name}`;
  const setup = await provisionGenericScenario({
    client,
    ids,
    slackWebhookUrl: null,
    subscriberUrl: emailDestination,
    subscriberType: 'email',
    subscriberMode: 'alert',
    subscriberName: `[Heads Up Inbox Smoke] ${name}`,
    signalKey,
    watchName: `[Heads Up Inbox Smoke] ${name}`,
    watchType,
    watchConfig: config,
    cooldownSeconds: 0,
  });

  await configureEmailTestSubscriber(ids, {
    run_id: runId,
    case_id: name,
    watch_type: watchType,
    signal_key: signalKey,
  });

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
        source: 'email-inbox-loop-smoke',
        occurredAt: event.occurredAt,
        fields: {
          email_inbox_loop: true,
          smoke_case: name,
          ...(event.fields || {}),
        },
        dimensions: {
          smoke_case: name,
          ...(event.dimensions || {}),
        },
      }),
    ),
  });

  const proof = await pollUntil({
    label: `${name} inbox receipt`,
    attempts: 80,
    intervalMs: 3000,
    check: async () => testedMessages(runId, name),
    isReady: (messages) => messages.some((message) => message.status === 'tested'),
  });
  const tested = proof.find((message) => message.status === 'tested');

  return {
    name,
    watch_type: watchType,
    signal_key: signalKey,
    recipient: recipientHint(emailDestination),
    queued: accepted.queued,
    message_id: tested?.id,
    delivery_id: tested?.delivery_id,
    alert_id: tested?.alert_id,
    received_at: tested?.received_at,
    tested_at: tested?.tested_at,
  };
}

async function runScheduledCases() {
  const ids = genericSmokeIds('email_inbox_scheduled');
  const signalKey = 'smoke.email.inbox.scheduled';
  await provisionGenericScenario({
    client,
    ids,
    slackWebhookUrl: null,
    subscriberUrl: emailDestination,
    subscriberType: 'email',
    subscriberMode: 'alert',
    subscriberName: '[Heads Up Inbox Smoke] scheduled',
    signalKey,
    watchName: '[Heads Up Inbox Smoke] unused scheduled seed',
    cooldownSeconds: 0,
  });

  await client.d1Query('DELETE FROM watches WHERE id = ?', [ids.watch]);
  const scheduledCases = [
    {
      suffix: 'missing',
      caseId: 'missing_expected',
      watchType: 'MISSING_EXPECTED',
      config: {
        expected_every: { count: 1, unit: 'minute' },
        minimum_count: 2,
        grace_seconds: 0,
        severity: 'warning',
        bucket_type: 'minute',
      },
    },
    {
      suffix: 'reminder',
      caseId: 'reminder_due',
      watchType: 'REMINDER_DUE',
      config: {
        due_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        lead: { count: 2, unit: 'hour' },
        expires_after_seconds: 7200,
        severity: 'warning',
        label: '[Heads Up Inbox Smoke] Reminder',
      },
    },
    {
      suffix: 'digest',
      caseId: 'digest',
      watchType: 'DIGEST',
      config: {
        schedule: 'hourly',
        severity: 'info',
        include: ['last_value', 'count_value'],
      },
    },
  ];
  await client.d1Query('UPDATE subscribers SET config_json = ?, destination_url_redacted = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify({
      template_id: 'base_alert_v1',
      email_test: {
        enabled: true,
        run_id: runId,
        signal_key: signalKey,
        cases_by_watch_id: Object.fromEntries(
          scheduledCases.map((testCase) => [
            watchId(ids, testCase.suffix),
            {
              run_id: runId,
              case_id: testCase.caseId,
              watch_type: testCase.watchType,
              signal_key: signalKey,
            },
          ]),
        ),
      },
    }),
    recipientHint(emailDestination),
    new Date().toISOString(),
    ids.subscriber,
  ]);
  await insertScheduledAggregate(ids, signalKey);
  for (const testCase of scheduledCases) {
    await insertScheduledWatch(ids, {
      suffix: testCase.suffix,
      type: testCase.watchType,
      config: testCase.config,
    });
  }

  try {
    const proof = await pollUntil({
      label: 'scheduled inbox receipts',
      attempts: 70,
      intervalMs: 3000,
      check: async () => {
        const rows = await client.d1Query(
          `SELECT id, case_id, status, alert_id, delivery_id, received_at, tested_at
           FROM email_test_messages
           WHERE run_id = ? AND case_id IN (?, ?, ?)
           ORDER BY updated_at DESC`,
          [runId, ...scheduledCases.map((testCase) => testCase.caseId)],
        );
        return rows?.results || [];
      },
      isReady: (messages) =>
        scheduledCases.every((testCase) =>
          messages.some((message) => message.case_id === testCase.caseId && message.status === 'tested'),
        ),
    });
    return scheduledCases.map((testCase) => {
      const message = proof.find((row) => row.case_id === testCase.caseId && row.status === 'tested');
      return {
        name: testCase.caseId,
        watch_type: testCase.watchType,
        signal_key: signalKey,
        recipient: recipientHint(emailDestination),
        queued: null,
        message_id: message?.id,
        delivery_id: message?.delivery_id,
        alert_id: message?.alert_id,
        received_at: message?.received_at,
        tested_at: message?.tested_at,
      };
    });
  } finally {
    await disableScheduledProof(ids);
  }
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
    events: [{ value: 25, occurredAt: previous }, { value: 10, occurredAt: current }],
  },
];

console.log(JSON.stringify({ step: 'health', base_url: runtime.baseUrl, health: await checkHealth(runtime.baseUrl) }, null, 2));
console.log(JSON.stringify({ step: 'start', run_id: runId, recipient: recipientHint(emailDestination), cases: cases.length }, null, 2));

const results = [];
for (const testCase of cases) {
  console.log(JSON.stringify({ step: 'case_start', name: testCase.name, watch_type: testCase.watchType }, null, 2));
  results.push(await runCase(testCase));
  console.log(JSON.stringify({ step: 'case_ok', result: results.at(-1) }, null, 2));
}

console.log(JSON.stringify({ step: 'scheduled_start', cases: 3 }, null, 2));
const scheduledResults = await runScheduledCases();
results.push(...scheduledResults);
console.log(JSON.stringify({ step: 'scheduled_ok', results: scheduledResults }, null, 2));

console.log(JSON.stringify({ ok: true, run_id: runId, tested: results.length, results }, null, 2));
