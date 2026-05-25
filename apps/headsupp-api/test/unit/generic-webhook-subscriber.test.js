import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryControlPlaneStore } from '../../src/services/control-plane/kv-store.js';
import { ownershipFieldsFromContext } from '../../src/services/ownership/tenant-scope.js';
import { createSubscriber } from '../../src/services/subscribers/create-subscriber.js';

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

test('creates generic webhook subscriber in alert mode', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'webhook',
      destination_url: 'https://api.foretic.io/heads-up/callback',
      display_name: 'Foretic callback',
      mode: 'alert',
    },
    context,
    workspace,
    channel,
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.subscriber.subscriber_type, 'webhook');
  assert.equal(result.subscriber.mode, 'alert');
  assert.equal(result.subscriber.destination_url, undefined);
  assert.equal(result.subscriber.destination_url_redacted, 'https://api.foretic.io/heads-up/callback/...');
});

test('creates generic webhook subscriber in aggregate_forward mode', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'webhook',
      destination_url: 'https://example.com/aggregate',
      mode: 'aggregate_forward',
    },
    context,
    workspace,
    channel,
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscriber.mode, 'aggregate_forward');
});

test('rejects invalid subscriber mode', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'webhook',
      destination_url: 'https://example.com/webhook',
      mode: 'everything',
    },
    context,
    workspace,
    channel,
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_SUBSCRIBER_MODE');
});

test('rejects non-https generic webhook URL', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'webhook',
      destination_url: 'http://example.com/webhook',
    },
    context,
    workspace,
    channel,
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_DESTINATION_URL');
});

test('generic webhook subscriber is idempotent for same channel and URL', async () => {
  const store = createMemoryControlPlaneStore();
  const input = {
    subscriber_type: 'webhook',
    destination_url: 'https://api.foretic.io/heads-up/callback',
    mode: 'alert',
  };

  const first = await createSubscriber({ input, context, workspace, channel, store });
  const second = await createSubscriber({ input, context, workspace, channel, store });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.subscriber.subscriber_id, second.subscriber.subscriber_id);
  assert.equal(second.created, false);
});

test('creates email subscriber with normalized destination and config recipients', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'email',
      destination_url: ' Martin@example.com ',
      display_name: 'Martin',
      mode: 'alert',
      config: {
        to: ['alerts@example.com'],
      },
    },
    context,
    workspace,
    channel,
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.subscriber.subscriber_type, 'email');
  assert.equal(result.subscriber.normalized_destination, 'martin@example.com');
  assert.match(result.subscriber.destination_url_redacted, /^ma\*\*\*@example\.com$/);
});

test('rejects email subscriber without valid recipient', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'email',
      destination_url: 'not-an-email',
      mode: 'alert',
    },
    context,
    workspace,
    channel,
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_EMAIL_RECIPIENT');
});

test('rejects generic webhook subscriber when workspace tenant mismatches', async () => {
  const result = await createSubscriber({
    input: {
      subscriber_type: 'webhook',
      destination_url: 'https://example.com/webhook',
    },
    context,
    workspace: { ...workspace, external_tenant_id: 'user:other' },
    channel,
    store: createMemoryControlPlaneStore(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TENANT_SCOPE_MISMATCH');
});
