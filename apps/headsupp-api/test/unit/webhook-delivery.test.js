import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dispatchAlertDelivery,
  genericAlertPayload,
  slackAlertPayload,
} from '../../src/services/delivery/webhook.js';

const alert = {
  id: 'alert_123',
  workspace_id: 'ws_123',
  channel_id: 'ch_123',
  signal_id: 'sig_123',
  watch_id: 'watch_123',
  severity: 'critical',
  summary_text: 'Revenue forecast is critical at 64%.',
  current_value: 64,
  threshold_value: 70,
  triggered_at: '2026-05-24T10:00:00.000Z',
  cta_label: 'View forecast',
  cta_url: 'https://foretic.test/forecasts/fc_123',
};

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

test('builds generic alert webhook payload', () => {
  const payload = genericAlertPayload(alert, { metadata_json: '{"forecast_id":"fc_123"}' });

  assert.equal(payload.type, 'heads_up.alert');
  assert.equal(payload.alert_id, 'alert_123');
  assert.equal(payload.severity, 'critical');
  assert.deepEqual(payload.channel_metadata, { forecast_id: 'fc_123' });
  assert.equal(payload.cta.url, 'https://foretic.test/forecasts/fc_123');
});

test('builds Slack incoming webhook payload', () => {
  const payload = slackAlertPayload(alert);

  assert.match(payload.text, /Revenue forecast is critical/);
  assert.match(payload.text, /View forecast/);
});

test('dispatches webhook and marks delivery sent on 2xx', async () => {
  const calls = [];
  const requests = [];
  const result = await dispatchAlertDelivery({
    db: fakeDb(calls),
    delivery: {
      id: 'delivery_123',
      destination_url: 'https://example.com/webhook',
      attempt_count: 0,
    },
    alert,
    subscriber: {
      subscriber_type: 'webhook',
    },
    channel: {
      metadata_json: '{"forecast_id":"fc_123"}',
    },
    now: '2026-05-24T10:00:00.000Z',
    async fetchFn(url, init) {
      requests.push({ url, init });
      return new Response('ok', { status: 200 });
    },
  });

  assert.equal(result.status, 'sent');
  assert.equal(requests[0].url, 'https://example.com/webhook');
  assert.equal(JSON.parse(requests[0].init.body).type, 'heads_up.alert');
  assert.equal(JSON.parse(requests[0].init.body).channel_metadata.forecast_id, 'fc_123');
  assert.equal(calls[0].params[0], 'sent');
});

test('dispatch records retrying state on transient webhook failure', async () => {
  const calls = [];
  const result = await dispatchAlertDelivery({
    db: fakeDb(calls),
    delivery: {
      id: 'delivery_123',
      destination_url: 'https://example.com/webhook',
      attempt_count: 0,
    },
    alert,
    subscriber: {
      subscriber_type: 'webhook',
    },
    now: '2026-05-24T10:00:00.000Z',
    async fetchFn() {
      return new Response('rate limited', { status: 429 });
    },
  });

  assert.equal(result.status, 'retrying');
  assert.equal(calls[0].params[0], 'retrying');
  assert.equal(calls[0].params[3], '2026-05-24T10:01:00.000Z');
});

test('dispatch supports internal smoke status transport when enabled', async () => {
  const calls = [];
  const result = await dispatchAlertDelivery({
    db: fakeDb(calls),
    delivery: {
      id: 'delivery_123',
      destination_url: 'smoke://status/200',
      attempt_count: 1,
    },
    alert,
    subscriber: {
      subscriber_type: 'webhook',
      source_app: 'headsupp-smoke',
    },
    env: {
      HEADSUPP_SMOKE_TRANSPORT_ENABLED: 'true',
    },
    now: '2026-05-24T10:02:00.000Z',
    async fetchFn() {
      throw new Error('smoke transport should not fetch');
    },
  });

  assert.equal(result.status, 'sent');
  assert.equal(result.attempt_count, 2);
  assert.equal(calls[0].params[0], 'sent');
  assert.equal(calls[0].params[5], 'smoke status 200');
});

test('dispatch does not use smoke transport for non-smoke subscribers', async () => {
  const calls = [];
  const requests = [];
  const result = await dispatchAlertDelivery({
    db: fakeDb(calls),
    delivery: {
      id: 'delivery_123',
      destination_url: 'smoke://status/200',
      attempt_count: 0,
    },
    alert,
    subscriber: {
      subscriber_type: 'webhook',
      source_app: 'customer-app',
    },
    env: {
      HEADSUPP_SMOKE_TRANSPORT_ENABLED: 'true',
    },
    now: '2026-05-24T10:02:00.000Z',
    async fetchFn(url) {
      requests.push(url);
      return new Response('real fetch path', { status: 400 });
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(requests[0], 'smoke://status/200');
  assert.equal(calls[0].params[5], 'real fetch path');
});
