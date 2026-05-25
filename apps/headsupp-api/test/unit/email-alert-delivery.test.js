import assert from 'node:assert/strict';
import test from 'node:test';

import { dispatchEmailAlertDelivery } from '../../src/services/delivery/email-alert.js';

function fakeDb(calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const alert = {
  id: 'alert_1',
  severity: 'warning',
  summary_text: 'Coffee spend warning',
  current_value: 92,
  threshold_value: 100,
  cta_label: 'View coffee spend',
  cta_url: 'https://example.com/coffee',
  payload_json: JSON.stringify({ fields: {} }),
};

const subscriber = {
  id: 'sub_1',
  subscriber_id: 'sub_1',
  channel_id: 'ch_1',
  mode: 'alert',
  subscriber_type: 'email',
  destination_url: 'martin@example.com',
  name: 'Martin',
  config_json: JSON.stringify({
    from: { email: 'alerts@headsupp.io', name: 'Heads Up' },
    template_id: 'base_alert_v1',
  }),
};

test('marks email delivery sent on successful send', async () => {
  const calls = [];
  const result = await dispatchEmailAlertDelivery({
    db: fakeDb(calls),
    delivery: { id: 'delivery_1', attempt_count: 0 },
    alert,
    subscriber,
    channel: {},
    env: {
      HEADSUPP_UNSUBSCRIBE_SECRET: 'secret_123',
      HEADSUPP_PUBLIC_BASE_URL: 'https://headsupp.io',
    },
    now: '2026-05-25T12:00:00.000Z',
    sendEmailFn: async () => ({ id: 'provider_1' }),
  });

  assert.equal(result.status, 'sent');
  assert.ok(calls.some((call) => /UPDATE alert_deliveries/.test(call.sql)));
});

test('marks email delivery retrying on transient error', async () => {
  const calls = [];
  const result = await dispatchEmailAlertDelivery({
    db: fakeDb(calls),
    delivery: { id: 'delivery_1', attempt_count: 0 },
    alert,
    subscriber,
    channel: {},
    env: {
      HEADSUPP_UNSUBSCRIBE_SECRET: 'secret_123',
      HEADSUPP_PUBLIC_BASE_URL: 'https://headsupp.io',
    },
    now: '2026-05-25T12:00:00.000Z',
    sendEmailFn: async () => {
      const error = new Error('provider timeout');
      error.code = 'PROVIDER_TIMEOUT';
      throw error;
    },
  });

  assert.equal(result.status, 'retrying');
  assert.equal(calls[0].params[0], 'retrying');
});

test('marks email delivery failed when binding is missing', async () => {
  const calls = [];
  const result = await dispatchEmailAlertDelivery({
    db: fakeDb(calls),
    delivery: { id: 'delivery_1', attempt_count: 0 },
    alert,
    subscriber,
    channel: {},
    env: {},
    now: '2026-05-25T12:00:00.000Z',
  });

  assert.equal(result.status, 'failed');
  assert.equal(calls[0].params[0], 'failed');
});
