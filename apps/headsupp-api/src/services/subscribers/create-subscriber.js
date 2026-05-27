import { stableId } from '../ids/stable-id.js';
import { ownershipFieldsFromContext, requireChannelInWorkspace } from '../ownership/tenant-scope.js';
import { redactSubscriberDestination, validateSubscriberUrl } from './urls.js';

const VALID_MODES = new Set(['alert', 'aggregate_forward', 'quiet_summary', 'lifecycle']);

export function publicSubscriber(subscriber) {
  return {
    ...subscriber,
    destination_url: undefined,
    destination_url_redacted: redactSubscriberDestination(subscriber.subscriber_type, subscriber.destination_url),
  };
}

export async function createSubscriber({ input, context, workspace, channel, store, now = new Date().toISOString() }) {
  const relationship = requireChannelInWorkspace(channel, workspace, context);
  if (!relationship.ok) return relationship;

  const mode = input.mode || 'alert';
  if (!VALID_MODES.has(mode)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_MODE',
      message: `Subscriber mode must be one of: ${Array.from(VALID_MODES).join(', ')}.`,
    };
  }

  const subscriberType = input.subscriber_type;
  if (mode === 'lifecycle' && subscriberType !== 'webhook') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_MODE',
      message: 'Subscriber mode lifecycle is only supported for subscriber_type webhook.',
    };
  }

  let config = input.config_json ?? input.config ?? {};
  if (typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch {
      config = {};
    }
  }
  const url = validateSubscriberUrl(subscriberType, input.destination_url, config);
  if (!url.ok) return url;

  const normalizedDestination = url.normalized_destination || input.destination_url;
  const subscriberKey = `${workspace.workspace_id}:${channel.channel_id}:${subscriberType}:${mode}:${normalizedDestination}`;
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
    normalized_destination: normalizedDestination,
    display_name: input.display_name || subscriberType,
    mode,
    config_json: JSON.stringify(config),
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
