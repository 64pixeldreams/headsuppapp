import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryControlPlaneStore } from '../../src/services/control-plane/kv-store.js';
import { ownershipFieldsFromContext } from '../../src/services/ownership/tenant-scope.js';
import { createSubscriber } from '../../src/services/subscribers/create-subscriber.js';
import {
  isSlackWebhookUrl,
  redactUrl,
  resolveSubscriberRecipients,
  validateSubscriberUrl,
} from '../../src/services/subscribers/urls.js';

const context = {
  source_app: 'foretic',
  external_tenant_id: 'user:mkfoxvxgoyfbtd',
  external_user_id: 'user:mkfoxvxgoyfbtd',
  external_account_id: 'user:mkfoxvxgoyfbtd',
  external_resource_id: 'oracle_forecast:mlfl1bfqrxnbk1',
};

const workspace = {
  workspace_id: 'ws_123',
  ...ownershipFieldsFromContext(context),
};

const channel = {
  channel_id: 'ch_123',
  workspace_id: 'ws_123',
  ...ownershipFieldsFromContext(context),
};

const fakeSlackUrl = 'https://hooks.slack.com/services/T_TEST/B_TEST/TEST_SECRET';

test('recognizes fake Slack webhook URL shape', () => {
  assert.equal(isSlackWebhookUrl(fakeSlackUrl), true);
});

test('rejects non-https Slack webhook URL', () => {
  assert.deepEqual(validateSubscriberUrl('slack_webhook', 'http://hooks.slack.com/services/T/B/C'), {
    ok: false,
    status: 400,
    code: 'INVALID_DESTINATION_URL',
    message: 'Subscriber destination_url must be a valid https URL.',
  });
});

test('rejects non-Slack URL for Slack webhook subscriber', () => {
  assert.deepEqual(validateSubscriberUrl('slack_webhook', 'https://example.com/webhook'), {
    ok: false,
    status: 400,
    code: 'INVALID_SLACK_WEBHOOK_URL',
    message: 'Slack subscribers require a Slack incoming webhook URL.',
  });
});

test('creates Slack webhook subscriber with tenant ownership fields', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'slack_webhook',
      destination_url: fakeSlackUrl,
      display_name: '#forecast-alerts',
    },
    context,
    workspace,
    channel,
    store: createMemoryControlPlaneStore(),
    now: '2026-05-24T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.subscriber.subscriber_type, 'slack_webhook');
  assert.equal(result.subscriber.mode, 'alert');
  assert.equal(result.subscriber.workspace_id, 'ws_123');
  assert.equal(result.subscriber.channel_id, 'ch_123');
  assert.equal(result.subscriber.external_tenant_id, 'user:mkfoxvxgoyfbtd');
  assert.equal(result.subscriber.destination_url, undefined);
  assert.equal(result.subscriber.destination_url_redacted, 'https://hooks.slack.com/services/T_TEST/...');
});

test('rejects Slack subscriber when channel is from another workspace', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'slack_webhook',
      destination_url: fakeSlackUrl,
    },
    context,
    workspace,
    channel: { ...channel, workspace_id: 'ws_other' },
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TENANT_SCOPE_MISMATCH');
});

test('redacts invalid URLs to null', () => {
  assert.equal(redactUrl('not a url'), null);
});

test('validates email subscriber recipients from destination and config.to', () => {
  const validated = validateSubscriberUrl('email', 'martin@example.com', {
    to: ['alerts@example.com', 'martin@example.com'],
  });
  assert.equal(validated.ok, true);
  assert.equal(validated.normalized_destination, 'martin@example.com');
  assert.deepEqual(resolveSubscriberRecipients({ destinationUrl: 'martin@example.com', config: { to: ['alerts@example.com'] } }), [
    'martin@example.com',
    'alerts@example.com',
  ]);
});
