import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../../src/index.js';
import { signConnectorPayload } from '../../src/services/connectors/hmac.js';

const env = {};
const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

async function json(response) {
  return response.json();
}

test('GET /health returns Heads Up health payload', async () => {
  const response = await worker.fetch(new Request('https://headsupp.test/health'), env, ctx);
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.app, 'headsupp_app');
  assert.equal(body.framework, 'CFKit');
});

test('GET /api/v1/health returns Heads Up health payload', async () => {
  const response = await worker.fetch(new Request('https://headsupp.test/api/v1/health'), env, ctx);
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.role, 'attention-processing-api');
});

test('GET /api/v1/observability/overview returns read-only counts', async () => {
  const counts = [1, 2, 3, 4, 5, 6, 7, 8];
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return { count: counts.shift() };
              },
            };
          },
        };
      },
    },
  };
  const response = await worker.fetch(
    new Request('https://example.com/api/v1/observability/overview', {
      headers: {
        Authorization: 'Bearer test-operator-token',
      },
    }),
    {
      ...env,
      HEADSUPP_OPERATOR_TOKEN: 'test-operator-token',
    },
    ctx,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.active_watches, 1);
  assert.equal(body.data.deliveries.aggregates.failed, 7);
});

test('POST /api/function dispatches CFKit function', async () => {
  const response = await worker.fetch(
    new Request('https://headsupp.test/api/function', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'headsupp.health',
        payload: {},
      }),
    }),
    env,
    ctx,
  );
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.app, 'headsupp_app');
});

test('POST /v1/events/{connector_key} is reserved for ingest story', async () => {
  const response = await worker.fetch(
    new Request('https://headsupp.test/v1/events/test_connector', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    env,
    ctx,
  );
  const body = await json(response);

  assert.equal(response.status, 501);
  assert.equal(body.accepted, false);
  assert.equal(body.error.code, 'INGEST_STORE_NOT_CONFIGURED');
});

test('POST /v1/events/{connector_key} verifies connector HMAC auth', async () => {
  const rawBody = JSON.stringify({
    idempotency_key: 'foretic_fc123_2026_05_24_1000',
    signal_key: 'forecast.revenue.pace',
    occurred_at: '2026-05-24T10:00:00.000Z',
    value: { num: 64 },
  });
  const timestamp = new Date().toISOString();
  const connector = {
    connector_id: 'conn_test',
    connector_key: 'ck_test',
    connector_secret: 'hu_sec_test_secret',
    workspace_id: 'ws_123',
    channel_id: 'ch_123',
    enabled: true,
  };
  const signature = await signConnectorPayload({
    secret: connector.connector_secret,
    timestamp,
    rawBody,
  });
  const kvData = new Map([
    ['control:connector_by_key:ck_test', connector],
  ]);
  const queueBatches = [];
  const envWithKV = {
    HEADSUPP_CACHE: {
      async get(key) {
        return kvData.get(key) || null;
      },
      async put(key, value) {
        kvData.set(key, JSON.parse(value));
      },
    },
    RAW_EVENTS_QUEUE: {
      async sendBatch(batch) {
        queueBatches.push(batch);
      },
    },
  };

  const response = await worker.fetch(
    new Request('https://headsupp.test/v1/events/ck_test', {
      method: 'POST',
      headers: {
        'X-HeadsUp-Timestamp': timestamp,
        'X-HeadsUp-Signature': signature,
      },
      body: rawBody,
    }),
    envWithKV,
    ctx,
  );
  const body = await json(response);

  assert.equal(response.status, 202);
  assert.equal(body.accepted, true);
  assert.equal(body.authenticated, true);
  assert.equal(body.queued, 1);
  assert.equal(body.connector_key, 'ck_test');
  assert.equal(queueBatches.length, 1);
  assert.equal(queueBatches[0][0].body.event.signal_key, 'forecast.revenue.pace');
});

test('POST /v1/events/{connector_key} queues batch events', async () => {
  const rawBody = JSON.stringify({
    events: [
      { idempotency_key: 'evt_001', signal_key: 'oxygen.percent', occurred_at: '2026-05-24T10:00:00Z', value: { num: 10 } },
      { idempotency_key: 'evt_002', signal_key: 'oxygen.percent', occurred_at: '2026-05-24T10:00:01Z', value: { num: 20 } },
    ],
  });
  const timestamp = new Date().toISOString();
  const connector = {
    connector_id: 'conn_test',
    connector_key: 'ck_batch',
    connector_secret: 'hu_sec_test_secret',
    workspace_id: 'ws_123',
    channel_id: 'ch_123',
    enabled: true,
  };
  const signature = await signConnectorPayload({ secret: connector.connector_secret, timestamp, rawBody });
  const queueBatches = [];
  const envWithKV = {
    HEADSUPP_CACHE: {
      async get(key) {
        return key === 'control:connector_by_key:ck_batch' ? connector : null;
      },
    },
    RAW_EVENTS_QUEUE: {
      async sendBatch(batch) {
        queueBatches.push(batch);
      },
    },
  };

  const response = await worker.fetch(
    new Request('https://headsupp.test/v1/events/ck_batch', {
      method: 'POST',
      headers: {
        'X-HeadsUp-Timestamp': timestamp,
        'X-HeadsUp-Signature': signature,
      },
      body: rawBody,
    }),
    envWithKV,
    ctx,
  );
  const body = await json(response);

  assert.equal(response.status, 202);
  assert.equal(body.queued, 2);
  assert.equal(queueBatches[0].length, 2);
});
