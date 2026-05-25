import assert from 'node:assert/strict';
import test from 'node:test';

import { dispatchAlertDeliveryBySubscriberType } from '../../src/services/delivery/alert-router.js';

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

const base = {
  db: fakeDb(),
  delivery: { id: 'delivery_1', destination_url: 'https://example.com/webhook', attempt_count: 0 },
  alert: {
    id: 'alert_1',
    severity: 'warning',
    summary_text: 'Test warning',
    current_value: 10,
    threshold_value: 5,
    payload_json: '{"fields":{}}',
  },
  subscriber: { subscriber_type: 'webhook' },
  channel: {},
  now: '2026-05-25T12:00:00.000Z',
};

test('routes webhook subscribers to webhook dispatcher', async () => {
  const result = await dispatchAlertDeliveryBySubscriberType({
    ...base,
    fetchFn: async () => new Response('ok', { status: 200 }),
  });
  assert.equal(result.status, 'sent');
});

test('routes email subscribers to email dispatcher', async () => {
  const calls = [];
  const result = await dispatchAlertDeliveryBySubscriberType({
    ...base,
    db: fakeDb(calls),
    delivery: { id: 'delivery_2', attempt_count: 0 },
    subscriber: {
      id: 'sub_1',
      subscriber_id: 'sub_1',
      channel_id: 'ch_1',
      mode: 'alert',
      subscriber_type: 'email',
      destination_url: 'martin@example.com',
      config_json: '{}',
    },
    env: {
      SEND_EMAIL: { send: async () => ({ id: 'provider_1' }) },
      HEADSUPP_UNSUBSCRIBE_SECRET: 'secret_123',
      HEADSUPP_PUBLIC_BASE_URL: 'https://headsupp.io',
    },
  });

  assert.equal(result.status, 'sent');
  assert.ok(calls.some((call) => /UPDATE alert_deliveries/.test(call.sql)));
});
