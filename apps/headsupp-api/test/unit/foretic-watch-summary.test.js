import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryControlPlaneStore } from '../../src/services/control-plane/kv-store.js';
import { createForeticForecastWatch } from '../../src/services/foretic/create-forecast-watch.js';

const auth = {
  type: 'api',
  user_id: 'user:foretic-service',
  permissions: ['foretic:provision'],
};

test('Foretic watch setup summary captures end-to-end provisioning state', async () => {
  const result = await createForeticForecastWatch({
    auth,
    input: {
      user_id: 'user:mkfoxvxgoyfbtd',
      forecast_id: 'oracle_forecast:mlfl1bfqrxnbk1',
      forecast_name: 'RB sales history (stripe)',
      slack_webhook_url: 'https://hooks.slack.com/services/T_TEST/B_TEST/TEST_SECRET',
      foretic_callback_url: 'https://api.foretic.io/heads-up/callback',
    },
    store: createMemoryControlPlaneStore(),
    now: '2026-05-24T10:00:00.000Z',
    secretFactory: () => 'hu_sec_test_secret',
    baseUrl: 'https://headsupp.test',
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.event_url.startsWith('https://headsupp.test/v1/events/'), true);
  assert.equal(result.summary.connector.secret_returned, true);
  assert.equal(result.summary.signal_contract.signal_key, 'forecast.revenue.pace');
  assert.deepEqual(
    result.summary.watches.map((watch) => [watch.watch_type, watch.threshold, watch.severity]),
    [
      ['LAST_VALUE_LT', 85, 'warning'],
      ['LAST_VALUE_LT', 70, 'critical'],
    ],
  );
  assert.equal(result.summary.subscribers.some((subscriber) => subscriber.mode === 'aggregate_forward'), true);
});

test('Foretic watch setup summary omits secret on idempotent repeat', async () => {
  const store = createMemoryControlPlaneStore();
  const input = {
    user_id: 'user:mkfoxvxgoyfbtd',
    forecast_id: 'oracle_forecast:mlfl1bfqrxnbk1',
    forecast_name: 'RB sales history (stripe)',
  };

  await createForeticForecastWatch({ auth, input, store, secretFactory: () => 'hu_sec_first' });
  const repeat = await createForeticForecastWatch({ auth, input, store, secretFactory: () => 'hu_sec_second' });

  assert.equal(repeat.summary.connector.secret_returned, false);
  assert.equal(repeat.summary.connector.connector_secret, undefined);
});
