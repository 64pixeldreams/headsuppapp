import assert from 'node:assert/strict';
import test from 'node:test';

import { chunkMessages, createRawEventMessages, sendRawEventMessages } from '../../src/services/ingest/raw-event-queue.js';

test('chunks raw queue messages into max 100 item batches', () => {
  const messages = Array.from({ length: 205 }, (_, index) => ({ id: index }));

  assert.deepEqual(
    chunkMessages(messages).map((chunk) => chunk.length),
    [100, 100, 5],
  );
});

test('creates raw queue messages from connector ownership and events', () => {
  const messages = createRawEventMessages({
    connector: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      connector_id: 'conn_123',
      connector_key: 'ck_123',
    },
    receivedAt: '2026-05-24T10:00:00.000Z',
    events: [{ signal_key: 'oxygen.percent', occurred_at: '2026-05-24T10:00:00.000Z', value: { num: 10 } }],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].workspaceId, 'ws_123');
  assert.equal(messages[0].channelId, 'ch_123');
  assert.equal(messages[0].connectorId, 'conn_123');
});

test('sends raw queue messages through sendBatch', async () => {
  const batches = [];
  const queue = {
    async sendBatch(batch) {
      batches.push(batch);
    },
  };
  const result = await sendRawEventMessages(queue, Array.from({ length: 101 }, (_, index) => ({ id: index })));

  assert.equal(result.ok, true);
  assert.equal(result.queued, 101);
  assert.deepEqual(batches.map((batch) => batch.length), [100, 1]);
});

test('rejects missing raw events queue binding', async () => {
  const result = await sendRawEventMessages(null, [{ id: 1 }]);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RAW_EVENTS_QUEUE_NOT_CONFIGURED');
});
