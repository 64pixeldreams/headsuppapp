import { stableId } from '../ids/stable-id.js';
import { ownershipFieldsFromContext, requireChannelInWorkspace } from '../ownership/tenant-scope.js';
import { redactUrl, validateSubscriberUrl } from './urls.js';

const VALID_MODES = new Set(['alert', 'aggregate_forward']);

export function publicSubscriber(subscriber) {
  return {
    ...subscriber,
    destination_url: undefined,
    destination_url_redacted: redactUrl(subscriber.destination_url),
  };
}

export async function createSubscriber({ input, context, workspace, channel, store, now = new Date().toISOString() }) {
  const relationship = requireChannelInWorkspace(channel, workspace, context);
  if (!relationship.ok) return relationship;

  const subscriberType = input.subscriber_type;
  const mode = input.mode || 'alert';
  if (!VALID_MODES.has(mode)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_MODE',
      message: `Subscriber mode must be one of: ${Array.from(VALID_MODES).join(', ')}.`,
    };
  }

  const url = validateSubscriberUrl(subscriberType, input.destination_url);
  if (!url.ok) return url;

  const subscriberKey = `${workspace.workspace_id}:${channel.channel_id}:${subscriberType}:${mode}:${input.destination_url}`;
  const existing = await store.get('subscriber', subscriberKey);
  if (existing) {
    return {
      ok: true,
      created: false,
      subscriber: publicSubscriber(existing),
    };
  }

  const subscriber = {
    subscriber_id: stableId('sub', subscriberKey),
    subscriber_key: subscriberKey,
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    subscriber_type: subscriberType,
    destination_url: input.destination_url,
    display_name: input.display_name || subscriberType,
    mode,
    enabled: true,
    created_at: now,
    updated_at: now,
    ...ownershipFieldsFromContext(context),
  };

  await store.put('subscriber', subscriberKey, subscriber);

  return {
    ok: true,
    created: true,
    subscriber: publicSubscriber(subscriber),
  };
}
