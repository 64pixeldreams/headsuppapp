import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryControlPlaneStore } from '../../src/services/control-plane/kv-store.js';
import { createForeticForecastWatch } from '../../src/services/foretic/create-forecast-watch.js';

const serviceAuth = {
  type: 'api',
  user_id: 'user:foretic-service',
  permissions: ['foretic:provision'],
};

const fixture = {
  user_id: 'user:mkfoxvxgoyfbtd',
  forecast_id: 'oracle_forecast:mlfl1bfqrxnbk1',
  forecast_name: 'RB sales history (stripe)',
  slack_webhook_url: 'https://hooks.slack.com/services/T_TEST/B_TEST/TEST_SECRET',
  foretic_callback_url: 'https://api.foretic.io/heads-up/callback',
};

test('creates Foretic forecast watch setup resources', async () => {
  const result = await createForeticForecastWatch({
    auth: serviceAuth,
    input: fixture,
    store: createMemoryControlPlaneStore(),
    now: '2026-05-24T10:00:00.000Z',
    secretFactory: () => 'hu_sec_test_secret',
    baseUrl: 'https://headsupp.test',
  });

  assert.equal(result.ok, true);
  assert.equal(result.workspace.workspace_key, 'foretic:user:mkfoxvxgoyfbtd');
  assert.equal(result.channel.channel_key, 'foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mlfl1bfqrxnbk1');
  assert.equal(result.connector.connector_secret, 'hu_sec_test_secret');
  assert.equal(result.event_url, `https://headsupp.test/v1/events/${result.connector.connector_key}`);
  assert.equal(result.signal_contract.signal_key, 'forecast.revenue.pace');
  assert.deepEqual(
    result.watches.map((watch) => [watch.watch_type, watch.threshold, watch.severity]),
    [
      ['LAST_VALUE_LT', 85, 'warning'],
      ['LAST_VALUE_LT', 70, 'critical'],
    ],
  );
  assert.equal(result.watches[0].recovery_json?.condition, 'value >= 95');
  assert.equal(result.subscribers.length, 2);
  assert.equal(result.subscribers[0].subscriber_type, 'slack_webhook');
  assert.equal(result.subscribers[0].destination_url, undefined);
  assert.equal(result.subscribers[1].subscriber_type, 'webhook');
  assert.equal(result.subscribers[1].mode, 'aggregate_forward');
});

test('forecast watch provisioning is idempotent and only shows connector secret once', async () => {
  const store = createMemoryControlPlaneStore();
  const first = await createForeticForecastWatch({
    auth: serviceAuth,
    input: fixture,
    store,
    secretFactory: () => 'hu_sec_test_secret',
  });
  const second = await createForeticForecastWatch({
    auth: serviceAuth,
    input: fixture,
    store,
    secretFactory: () => 'hu_sec_different',
  });

  assert.equal(first.connector.connector_key, second.connector.connector_key);
  assert.equal(first.connector.connector_secret, 'hu_sec_test_secret');
  assert.equal(second.connector.connector_secret, undefined);
  assert.equal(second.created.connector, false);
  assert.equal(second.subscribers.length, 2);
});

test('forecast watch provisioning supports callback-only subscriber setup', async () => {
  const result = await createForeticForecastWatch({
    auth: serviceAuth,
    input: {
      user_id: fixture.user_id,
      forecast_id: fixture.forecast_id,
      forecast_name: fixture.forecast_name,
      foretic_callback_url: fixture.foretic_callback_url,
    },
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscribers.length, 1);
  assert.equal(result.subscribers[0].subscriber_type, 'webhook');
});

test('forecast watch provisioning rejects missing forecast id', async () => {
  const result = await createForeticForecastWatch({
    auth: serviceAuth,
    input: {
      user_id: fixture.user_id,
      forecast_name: fixture.forecast_name,
    },
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.code, 'MISSING_FORECAST_ID');
});

test('forecast watch provisioning rejects invalid Slack webhook URL', async () => {
  const result = await createForeticForecastWatch({
    auth: serviceAuth,
    input: {
      ...fixture,
      slack_webhook_url: 'https://example.com/not-slack',
    },
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_SLACK_WEBHOOK_URL');
});
