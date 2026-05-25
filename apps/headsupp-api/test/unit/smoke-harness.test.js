import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMetricEvent, buildMetricEvents } from '../../scripts/smoke/events.mjs';
import { genericSmokeIds } from '../../scripts/smoke/generic-provisioning.mjs';
import { pollUntil } from '../../scripts/smoke/polling.mjs';
import { redactSecret, redactSlackUrl, redactUrl, smokeRuntime } from '../../scripts/smoke/runtime.mjs';

test('redacts runtime secrets from smoke output', () => {
  assert.equal(
    redactSlackUrl('https://hooks.slack.com/services/T_TEST/B_TEST/TEST_SECRET'),
    'https://hooks.slack.com/services/T_TEST/...',
  );
  assert.equal(redactUrl('https://example.com/hooks/abc/secret'), 'https://example.com/hooks/abc/...');
  assert.equal(redactSecret('cfat_1234567890'), 'cfat...7890');
});

test('builds deterministic smoke ids', () => {
  const ids = genericSmokeIds('Generic Slack');

  assert.equal(ids.workspace, 'smoke_generic_slack_workspace');
  assert.equal(ids.connectorKey, 'ck_smoke_generic_slack');
  assert.equal(ids.watch, 'smoke_generic_slack_watch');
});

test('builds signed-event inputs with unique idempotency keys', () => {
  const event = buildMetricEvent({
    runId: 'run_1',
    name: 'trigger',
    signalKey: 'demo.metric',
    value: 15,
    source: 'unit',
  });
  const events = buildMetricEvents({
    runId: 'run_1',
    count: 2,
    signalKey: 'demo.metric',
    value: 5,
    source: 'unit',
    startAt: Date.parse('2026-05-24T10:00:00.000Z'),
  });

  assert.equal(event.idempotency_key, 'generic-smoke:run_1:trigger');
  assert.equal(event.value.num, 15);
  assert.equal(event.fields.source, 'unit');
  assert.equal(events[0].occurred_at, '2026-05-24T10:00:00.000Z');
  assert.equal(new Set(events.map((item) => item.idempotency_key)).size, 2);
});

test('pollUntil returns when ready and times out with latest state', async () => {
  let attempts = 0;
  const result = await pollUntil({
    label: 'unit ready',
    intervalMs: 1,
    attempts: 3,
    check: async () => {
      attempts += 1;
      return { attempts };
    },
    isReady: (state) => state.attempts === 2,
  });

  assert.deepEqual(result, { attempts: 2 });

  await assert.rejects(
    pollUntil({
      label: 'unit timeout',
      intervalMs: 1,
      attempts: 1,
      check: async () => ({ ok: false }),
      isReady: () => false,
    }),
    /Timed out waiting for unit timeout/,
  );
});

test('smokeRuntime reads deploy defaults and environment overrides', () => {
  const runtime = smokeRuntime({
    CLOUDFLARE_API_TOKEN: 'token',
    HEADSUPP_SMOKE_SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T/B/C',
    HEADSUPP_SMOKE_BASE_URL: 'https://example.com/',
    HEADSUPP_SMOKE_SERVICE_API_KEY: 'hu_service',
    HEADSUPP_BOOTSTRAP_TOKEN: 'bootstrap',
    HEADSUPP_OPERATOR_TOKEN: 'operator',
  });

  assert.equal(runtime.baseUrl, 'https://example.com');
  assert.equal(runtime.apiToken, 'token');
  assert.equal(runtime.serviceApiKey, 'hu_service');
  assert.equal(runtime.bootstrapToken, 'bootstrap');
  assert.equal(runtime.operatorToken, 'operator');
});
