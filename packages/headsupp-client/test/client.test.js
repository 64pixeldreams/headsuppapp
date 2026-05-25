import assert from 'node:assert/strict';
import test from 'node:test';

import { createHeadsUpClient, HeadsUpApiError } from '../src/index.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('calls control-plane actions and unwraps resources', async () => {
  const calls = [];
  const client = createHeadsUpClient({
    baseUrl: 'https://headsupp.example',
    apiKey: 'hu_api_test',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        success: true,
        data: {
          ok: true,
          workspace: { workspace_id: 'ws_demo', name: 'Demo' },
        },
      });
    },
  });

  const workspace = await client.createWorkspace({ name: 'Demo' });

  assert.equal(workspace.workspace_id, 'ws_demo');
  assert.equal(calls[0].url, 'https://headsupp.example/api/function');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer hu_api_test');
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'admin.createWorkspace', payload: { name: 'Demo' } });
});

test('supports getChannel and updateChannel wrappers', async () => {
  const calls = [];
  const client = createHeadsUpClient({
    baseUrl: 'https://headsupp.example',
    apiKey: 'hu_api_test',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        success: true,
        data: {
          ok: true,
          channel: {
            channel_id: 'ch_demo',
            name: 'Demo Channel',
            metadata: { forecast_id: 'fc_123' },
          },
        },
      });
    },
  });

  const channel = await client.getChannel({ workspace_id: 'ws_demo', channel_id: 'ch_demo' });
  const updated = await client.updateChannel({
    workspace_id: 'ws_demo',
    channel_id: 'ch_demo',
    metadata: { forecast_id: 'fc_456' },
  });

  assert.equal(channel.channel_id, 'ch_demo');
  assert.equal(updated.metadata.forecast_id, 'fc_123');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    action: 'admin.getChannel',
    payload: { workspace_id: 'ws_demo', channel_id: 'ch_demo' },
  });
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    action: 'admin.updateChannel',
    payload: { workspace_id: 'ws_demo', channel_id: 'ch_demo', metadata: { forecast_id: 'fc_456' } },
  });
});

test('throws useful API errors', async () => {
  const client = createHeadsUpClient({
    baseUrl: 'https://headsupp.example',
    apiKey: 'hu_api_test',
    fetch: async () =>
      jsonResponse({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: 'Nope.', status: 403 },
      }),
  });

  await assert.rejects(() => client.createWorkspace({ name: 'Demo' }), (error) => {
    assert.equal(error instanceof HeadsUpApiError, true);
    assert.equal(error.code, 'PERMISSION_DENIED');
    assert.equal(error.status, 403);
    return true;
  });
});

test('sends signed single events', async () => {
  const calls = [];
  const client = createHeadsUpClient({
    baseUrl: 'https://headsupp.example/',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        accepted: true,
        authenticated: true,
        queued: 1,
        rejected: 0,
        connector_key: 'ck_demo',
      }, 202);
    },
  });

  const result = await client.sendEvent({
    connectorKey: 'ck_demo',
    connectorSecret: 'hu_sec_test',
    timestamp: '2026-05-25T12:00:00.000Z',
    event: {
      idempotency_key: 'evt_1',
      signal_key: 'demo.metric',
      occurred_at: '2026-05-25T12:00:00.000Z',
      value: { num: 1 },
    },
  });

  assert.equal(result.queued, 1);
  assert.equal(calls[0].url, 'https://headsupp.example/v1/events/ck_demo');
  assert.match(calls[0].init.headers['X-HeadsUp-Signature'], /^sha256=[a-f0-9]{64}$/);
  assert.equal(JSON.parse(calls[0].init.body).signal_key, 'demo.metric');
});

test('sends signed event batches', async () => {
  const calls = [];
  const client = createHeadsUpClient({
    baseUrl: 'https://headsupp.example',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ accepted: true, authenticated: true, queued: 2, rejected: 0, connector_key: 'ck_demo' }, 202);
    },
  });

  const result = await client.sendEvents({
    connectorKey: 'ck_demo',
    connectorSecret: 'hu_sec_test',
    timestamp: '2026-05-25T12:00:00.000Z',
    events: [
      { idempotency_key: 'evt_1', signal_key: 'demo.metric', occurred_at: '2026-05-25T12:00:00.000Z', value: { num: 1 } },
      { idempotency_key: 'evt_2', signal_key: 'demo.metric', occurred_at: '2026-05-25T12:01:00.000Z', value: { num: 2 } },
    ],
  });

  assert.equal(result.queued, 2);
  assert.equal(JSON.parse(calls[0].init.body).events.length, 2);
});
