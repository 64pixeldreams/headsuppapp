/**
 * HeadsUp Behavioral Certification Suite
 *
 * Sends synthetic events with known inputs to a live deployed HeadsUp instance
 * and asserts exact behavioral outcomes: fires, silence, cooldown suppression,
 * recovery, deduplication, and noise rejection.
 *
 * Pass = HeadsUp is behaving correctly. If this passes, any alert problem is
 * downstream in the integration, not in HeadsUp itself.
 *
 * Usage:
 *   $env:CLOUDFLARE_API_TOKEN='<token>'
 *   npm run smoke:certify
 *
 * Optional overrides:
 *   $env:HEADSUPP_BASE_URL='https://custom.headsupp.io'  (default: wrangler.toml)
 */

import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  cleanupGenericScenario,
  genericSmokeIds,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { sleep } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const runId = `certify:${Date.now()}`;

// ── Timing constants ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 36;   // 90 s max to wait for an alert to fire
const SILENCE_WAIT_MS = 22_000; // 22 s to confirm nothing fired

// ── Helpers ───────────────────────────────────────────────────────────────────

function minuteBucket(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

// ── Case definitions ──────────────────────────────────────────────────────────
//
// Each case is isolated in its own workspace/channel. Expect shapes:
//   { min_alerts: N }           – at least N alerts created
//   { exact_alerts: N }         – exactly N alerts created
//   { max_alerts: 0, silence }  – no alerts within SILENCE_WAIT_MS

const CASES = [
  {
    id: 'gt-fires',
    description: 'LAST_VALUE_GT fires when value crosses threshold upward',
    watchType: 'LAST_VALUE_GT',
    watchConfig: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
    events: (sid) => [
      buildMetricEvent({ runId, name: 'tgt:trigger', signalKey: sid, value: 75, source: 'certify' }),
    ],
    expect: { min_alerts: 1 },
  },

  {
    id: 'gt-silent',
    description: 'LAST_VALUE_GT stays silent when value is below threshold — noise suppression',
    watchType: 'LAST_VALUE_GT',
    watchConfig: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
    events: (sid) => [
      buildMetricEvent({ runId, name: 'tgt_sil:1', signalKey: sid, value: 10, source: 'certify' }),
      buildMetricEvent({ runId, name: 'tgt_sil:2', signalKey: sid, value: 25, source: 'certify' }),
      buildMetricEvent({ runId, name: 'tgt_sil:3', signalKey: sid, value: 49, source: 'certify' }),
    ],
    expect: { max_alerts: 0, silence: true },
  },

  {
    id: 'lt-fires',
    description: 'LAST_VALUE_LT fires when value drops below threshold',
    watchType: 'LAST_VALUE_LT',
    watchConfig: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
    events: (sid) => [
      buildMetricEvent({ runId, name: 'tlt:trigger', signalKey: sid, value: 25, source: 'certify' }),
    ],
    expect: { min_alerts: 1 },
  },

  {
    id: 'cooldown',
    description: 'Cooldown prevents duplicate alerts within the cooldown window',
    watchType: 'LAST_VALUE_GT',
    watchConfig: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
    cooldownSeconds: 600,
    events: (sid) => [
      buildMetricEvent({ runId, name: 'cool:first', signalKey: sid, value: 75, source: 'certify' }),
      buildMetricEvent({ runId, name: 'cool:dupe', signalKey: sid, value: 80, source: 'certify' }),
    ],
    expect: { exact_alerts: 1 },
  },

  {
    id: 'wsum',
    description: 'WINDOW_SUM_GT accumulates events and fires when total exceeds threshold',
    watchType: 'WINDOW_SUM_GT',
    watchConfig: { threshold: 100, severity: 'warning', bucket_type: 'minute', window: { size: 2 } },
    events: (sid) => [
      buildMetricEvent({ runId, name: 'wsum:a', signalKey: sid, value: 60, source: 'certify' }),
      buildMetricEvent({ runId, name: 'wsum:b', signalKey: sid, value: 60, source: 'certify' }),
    ],
    expect: { min_alerts: 1 },
  },

  {
    id: 'pct-chg',
    description: 'PERCENT_CHANGE_GT fires on 75% relative increase between consecutive minute buckets',
    watchType: 'PERCENT_CHANGE_GT',
    watchConfig: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
    events: (sid) => [
      buildMetricEvent({ runId, name: 'pct:base', signalKey: sid, value: 100, occurredAt: minuteBucket(-2), source: 'certify' }),
      buildMetricEvent({ runId, name: 'pct:up', signalKey: sid, value: 175, occurredAt: minuteBucket(-1), source: 'certify' }),
    ],
    expect: { min_alerts: 1 },
  },

  {
    id: 'recovery',
    description: 'Recovery alert fires when value returns to safe range after an alert',
    watchType: 'LAST_VALUE_GT',
    watchConfig: { threshold: 50, severity: 'warning', bucket_type: 'minute' },
    recovery: { enabled: true, condition: 'value <= 10', severity: 'recovery' },
    events: (sid) => [
      buildMetricEvent({ runId, name: 'rec:alert', signalKey: sid, value: 75, occurredAt: minuteBucket(-2), source: 'certify' }),
      buildMetricEvent({ runId, name: 'rec:clear', signalKey: sid, value: 5, occurredAt: minuteBucket(-1), source: 'certify' }),
    ],
    expect: { min_alerts: 2 },
  },

  {
    id: 'trend-up',
    description: 'TREND_UP_GT fires when value trends 40% upward across 3 consecutive minute buckets',
    watchType: 'TREND_UP_GT',
    watchConfig: { threshold: 20, severity: 'info', bucket_type: 'minute', field: 'last_value', window: { size: 3 } },
    events: (sid) => [
      buildMetricEvent({ runId, name: 'trnd:a', signalKey: sid, value: 100, occurredAt: minuteBucket(-3), source: 'certify' }),
      buildMetricEvent({ runId, name: 'trnd:b', signalKey: sid, value: 115, occurredAt: minuteBucket(-2), source: 'certify' }),
      buildMetricEvent({ runId, name: 'trnd:c', signalKey: sid, value: 140, occurredAt: minuteBucket(-1), source: 'certify' }),
    ],
    expect: { min_alerts: 1 },
  },

  {
    id: 'evt-occ',
    description: 'EVENT_OCCURRENCE fires once per occurrence key; second event with same key is ignored',
    watchType: 'EVENT_OCCURRENCE',
    watchConfig: { event_type: 'certify_event', dedupe_key_path: 'fields.event_id', severity: 'info' },
    events: (sid) => [
      buildMetricEvent({ runId, name: 'evt:first', signalKey: sid, value: 1, source: 'certify', fields: { event_type: 'certify_event', event_id: 'cert_id_001' } }),
      // Different idempotency_key (different name) but same event_id — tests occurrence-level deduplication
      buildMetricEvent({ runId, name: 'evt:dupe', signalKey: sid, value: 1, source: 'certify', fields: { event_type: 'certify_event', event_id: 'cert_id_001' } }),
    ],
    expect: { exact_alerts: 1 },
  },

  {
    id: 'period-hi',
    description: 'Watch fires on the minute bucket where the high-value event occurs, ignoring a low-value prior bucket',
    watchType: 'LAST_VALUE_GT',
    watchConfig: { threshold: 100, severity: 'warning', bucket_type: 'minute' },
    events: (sid) => [
      // Low value in an older bucket — watch evaluates this bucket and stays silent
      buildMetricEvent({ runId, name: 'mxv:low', signalKey: sid, value: 30, occurredAt: minuteBucket(-2), source: 'certify' }),
      // High value in a separate, more recent bucket — watch evaluates this bucket and fires
      buildMetricEvent({ runId, name: 'mxv:hi', signalKey: sid, value: 150, occurredAt: minuteBucket(-1), source: 'certify' }),
    ],
    expect: { min_alerts: 1 },
  },

  {
    id: 'noise',
    description: 'Ten low-value events far below threshold produce zero alerts — the system is silent when it should be',
    watchType: 'LAST_VALUE_GT',
    watchConfig: { threshold: 10_000, severity: 'warning', bucket_type: 'minute' },
    events: (sid) => Array.from({ length: 10 }, (_, i) =>
      buildMetricEvent({ runId, name: `noise:${i}`, signalKey: sid, value: i + 1, source: 'certify' }),
    ),
    expect: { max_alerts: 0, silence: true },
  },
];

// ── Case runner ───────────────────────────────────────────────────────────────

async function runCase(testCase) {
  const ids = genericSmokeIds(`certify_${testCase.id}`);
  const signalKey = `certify.proof.${testCase.id.replace(/[^a-z0-9]+/g, '.')}`;
  const result = {
    id: testCase.id,
    description: testCase.description,
    pass: false,
    error: null,
    details: {},
  };

  try {
    const setup = await provisionGenericScenario({
      client,
      ids,
      slackWebhookUrl: null,
      subscriberUrl: 'https://example.com/certify-sink',
      subscriberType: 'slack_webhook',
      subscriberMode: 'alert',
      subscriberName: `[Certify] ${testCase.id}`,
      signalKey,
      watchName: `[Certify] ${testCase.id}`,
      watchType: testCase.watchType,
      watchConfig: testCase.watchConfig,
      cooldownSeconds: testCase.cooldownSeconds ?? 0,
      recovery: testCase.recovery ?? null,
    });

    // Disable the subscriber so no external delivery is attempted.
    // Alerts are still created — we check alert counts, not delivery counts.
    await client.d1Query(
      'UPDATE subscribers SET enabled = 0, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), ids.subscriber],
    );

    const before = await smokeCounts(client, ids);
    const events = testCase.events(signalKey);

    await sendSignedEvents({
      baseUrl: runtime.baseUrl,
      connectorKey: setup.connectorKey,
      connectorSecret: setup.connectorSecret,
      events,
    });

    if (testCase.expect.silence) {
      await sleep(SILENCE_WAIT_MS);
      const after = await smokeCounts(client, ids);
      const alertsFired = after.alerts - before.alerts;
      result.details = { events_sent: events.length, alerts_fired: alertsFired, expected_max: 0 };
      if (alertsFired > 0) {
        result.error = `Expected silence but ${alertsFired} alert(s) fired`;
      } else {
        result.pass = true;
      }
    } else {
      const { min_alerts, exact_alerts } = testCase.expect;
      let alertsFired = 0;
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS);
        const counts = await smokeCounts(client, ids);
        alertsFired = counts.alerts - before.alerts;
        const satisfied =
          (min_alerts !== undefined && alertsFired >= min_alerts) ||
          (exact_alerts !== undefined && alertsFired === exact_alerts);
        if (satisfied) break;
      }
      result.details = { events_sent: events.length, alerts_fired: alertsFired, expected: testCase.expect };
      if (exact_alerts !== undefined && alertsFired !== exact_alerts) {
        result.error = `Expected exactly ${exact_alerts} alert(s), got ${alertsFired}`;
      } else if (min_alerts !== undefined && alertsFired < min_alerts) {
        result.error = `Expected at least ${min_alerts} alert(s), got ${alertsFired}`;
      } else {
        result.pass = true;
      }
    }
  } catch (err) {
    result.error = err.message;
  } finally {
    await cleanupGenericScenario(client, ids);
  }

  const icon = result.pass ? '✓' : '✗';
  const suffix = result.error ? ` — ${result.error}` : '';
  console.log(`  ${icon} ${testCase.id}${suffix}`);
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const health = await checkHealth(runtime.baseUrl);
console.log(`\nHeadsUp Certification Suite`);
console.log(`${'─'.repeat(60)}`);
console.log(`  API: ${runtime.baseUrl}`);
console.log(`  Health: ${health.status} (${health.app || 'headsupp'})`);
console.log(`  Run ID: ${runId}`);
console.log(`  Cases: ${CASES.length}`);
console.log(`${'─'.repeat(60)}\n`);

const results = [];
for (const testCase of CASES) {
  results.push(await runCase(testCase));
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results:`);
for (const r of results) {
  const icon = r.pass ? '✓' : '✗';
  console.log(`  ${icon} ${r.id}`);
  if (!r.pass) console.log(`      → ${r.error}`);
}
console.log(`${'─'.repeat(60)}`);

if (failed === 0) {
  console.log(`\n  CERTIFIED ✓  ${passed}/${results.length} cases passed`);
  console.log(`  HeadsUp is behaving as designed.`);
  console.log(`  If alerts are missing in an integration, the issue is in the integration's`);
  console.log(`  event data, watch config, subscriber setup, or cooldown state — not HeadsUp.\n`);
} else {
  console.error(`\n  FAILED ✗  ${failed} case(s) did not behave as expected`);
  console.error(`  ${passed} of ${results.length} passed\n`);
  process.exit(1);
}
