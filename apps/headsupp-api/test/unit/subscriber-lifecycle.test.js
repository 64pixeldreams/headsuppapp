import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchSubscriberLifecycleEvent,
  subscriberLifecyclePayload,
} from '../../src/services/delivery/subscriber-lifecycle.js';

test('subscriberLifecyclePayload includes authorization and channel metadata', () => {
  const payload = subscriberLifecyclePayload({
    event: 'subscriber.authorized',
    occurredAt: '2026-05-26T12:00:00.000Z',
    channel: {
      channel_id: 'ch_demo',
      metadata_json: JSON.stringify({ forecast_id: 'forecast_1' }),
    },
    subscriber: {
      subscriber_id: 'sub_email_1',
      workspace_id: 'ws_demo',
      channel_id: 'ch_demo',
      subscriber_type: 'email',
      mode: 'alert',
      enabled: 1,
      normalized_destination: 'user@example.com',
      display_name: 'user@example.com',
      source_app: 'foretic',
      external_tenant_id: 'user:abc',
      external_user_id: 'user:abc',
      config_json: JSON.stringify({
        authorization: {
          required: true,
          status: 'authorized',
          requested_at: '2026-05-26T11:00:00.000Z',
          authorized_at: '2026-05-26T12:00:00.000Z',
        },
      }),
    },
  });

  assert.equal(payload.type, 'heads_up.subscriber.lifecycle');
  assert.equal(payload.event, 'subscriber.authorized');
  assert.equal(payload.normalized_destination, 'user@example.com');
  assert.equal(payload.authorization.status, 'authorized');
  assert.deepEqual(payload.channel_metadata, { forecast_id: 'forecast_1' });
});

test('dispatchSubscriberLifecycleEvent posts to lifecycle webhook subscribers', async () => {
  const requests = [];
  const fetchFn = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, status: 202 };
  };

  const db = {
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...args) {
          return {
            first() {
              if (normalized.includes('FROM channels')) {
                return { channel_id: args[0], metadata_json: JSON.stringify({ forecast_id: 'forecast_1' }) };
              }
              return null;
            },
            all() {
              if (normalized.includes("mode = 'lifecycle'")) {
                return {
                  results: [
                    {
                      subscriber_id: 'sub_lifecycle_1',
                      destination_url: 'https://example.com/headsupp/lifecycle',
                      config_json: JSON.stringify({ signing_secret: 'test-secret' }),
                    },
                  ],
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };

  const result = await dispatchSubscriberLifecycleEvent({
    db,
    env: {},
    event: 'subscriber.disabled',
    now: '2026-05-26T12:00:00.000Z',
    fetchFn,
    subscriber: {
      subscriber_id: 'sub_email_1',
      workspace_id: 'ws_demo',
      channel_id: 'ch_demo',
      subscriber_type: 'email',
      mode: 'alert',
      enabled: 0,
      normalized_destination: 'user@example.com',
      config_json: JSON.stringify({
        authorization: { required: true, status: 'pending', requested_at: '2026-05-26T11:00:00.000Z' },
      }),
    },
  });

  assert.equal(result.dispatched, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://example.com/headsupp/lifecycle');
  assert.equal(requests[0].body.event, 'subscriber.disabled');
  assert.match(requests[0].init.headers['X-HeadsUp-Signature'], /^v1=/);
});

test('dispatchSubscriberLifecycleEvent skips when no lifecycle subscribers exist', async () => {
  const fetchFn = async () => {
    throw new Error('fetch should not be called');
  };

  const db = {
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      return {
        bind() {
          return {
            first() {
              if (normalized.includes('FROM channels')) return { channel_id: 'ch_demo' };
              return null;
            },
            all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };

  const result = await dispatchSubscriberLifecycleEvent({
    db,
    env: {},
    event: 'subscriber.authorized',
    fetchFn,
    subscriber: {
      subscriber_id: 'sub_email_1',
      workspace_id: 'ws_demo',
      channel_id: 'ch_demo',
      subscriber_type: 'email',
      mode: 'alert',
      enabled: 1,
    },
  });

  assert.equal(result.dispatched, 0);
});
