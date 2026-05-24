import assert from 'node:assert/strict';
import test from 'node:test';

import { processAlertDeliveryMessage } from '../../src/services/delivery/alert-delivery-consumer.js';

function fakeDb(calls = []) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              if (sql.includes('FROM alert_deliveries')) {
                return {
                  id: 'delivery_123',
                  alert_id: 'alert_123',
                  subscriber_id: 'sub_123',
                  destination_url: 'https://example.com/webhook',
                  attempt_count: 0,
                };
              }
              if (sql.includes('FROM alerts')) {
                return {
                  id: 'alert_123',
                  workspace_id: 'ws_123',
                  channel_id: 'ch_123',
                  severity: 'warning',
                  summary_text: 'Forecast warning.',
                };
              }
              if (sql.includes('FROM subscribers')) {
                return {
                  subscriber_id: 'sub_123',
                  subscriber_type: 'webhook',
                };
              }
              return null;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test('processes alert delivery queue message', async () => {
  const calls = [];
  const result = await processAlertDeliveryMessage(
    { alertDeliveryId: 'delivery_123' },
    { DB: fakeDb(calls) },
    {
      now: '2026-05-24T10:00:00.000Z',
      async fetchFn() {
        return new Response('ok', { status: 200 });
      },
    },
  );

  assert.equal(result.processed, true);
  assert.equal(result.result.status, 'sent');
  assert.ok(calls.some((call) => call.sql.includes('UPDATE alert_deliveries')));
});
