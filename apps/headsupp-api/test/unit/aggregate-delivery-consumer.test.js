import assert from 'node:assert/strict';
import test from 'node:test';

import { processAggregateDeliveryMessage } from '../../src/services/delivery/aggregate-delivery-consumer.js';

function createDb({ delivery, subscriber }) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('FROM aggregate_deliveries')) return delivery;
              if (sql.includes('FROM subscribers')) return subscriber;
              return null;
            },
          };
        },
      };
    },
  };
}

test('skips aggregate dispatch when delivery is already sent', async () => {
  const db = createDb({
    delivery: { id: 'aggdel_sent', subscriber_id: 'sub_1', status: 'sent' },
    subscriber: { destination_url: 'https://example.com/hook' },
  });

  const result = await processAggregateDeliveryMessage(
    { aggregateDeliveryId: 'aggdel_sent' },
    { DB: db },
  );

  assert.equal(result.processed, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'TERMINAL_STATUS');
  assert.equal(result.status, 'sent');
});

test('skips aggregate dispatch when delivery is already failed', async () => {
  const db = createDb({
    delivery: { id: 'aggdel_failed', subscriber_id: 'sub_1', status: 'failed' },
    subscriber: { destination_url: 'https://example.com/hook' },
  });

  const result = await processAggregateDeliveryMessage(
    { aggregateDeliveryId: 'aggdel_failed' },
    { DB: db },
  );

  assert.equal(result.processed, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'TERMINAL_STATUS');
  assert.equal(result.status, 'failed');
});
