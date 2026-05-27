import { stableId } from '../ids/stable-id.js';
import { buildSignedWebhookHeaders } from './signing.js';

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseChannelMetadata(channel) {
  if (!channel) return {};
  if (channel.metadata && typeof channel.metadata === 'object' && !Array.isArray(channel.metadata)) return channel.metadata;
  try {
    return channel.metadata_json ? JSON.parse(channel.metadata_json) : {};
  } catch {
    return {};
  }
}

function sanitizeAuthorization(config = {}) {
  const authorization = config.authorization;
  if (!authorization || typeof authorization !== 'object') return null;
  return {
    required: authorization.required === true,
    status: authorization.status || null,
    requested_at: authorization.requested_at || null,
    authorized_at: authorization.authorized_at || null,
  };
}

export function subscriberLifecyclePayload({ event, subscriber, channel, occurredAt }) {
  const config = parseJson(subscriber.config_json, {});
  const payload = {
    type: 'heads_up.subscriber.lifecycle',
    event,
    occurred_at: occurredAt,
    workspace_id: subscriber.workspace_id,
    channel_id: subscriber.channel_id,
    subscriber_id: subscriber.subscriber_id || subscriber.id,
    subscriber_type: subscriber.subscriber_type,
    mode: subscriber.mode,
    enabled: subscriber.enabled === 0 || subscriber.enabled === false ? false : Boolean(subscriber.enabled),
    display_name: subscriber.display_name || subscriber.name || null,
    source_app: subscriber.source_app || null,
    external_tenant_id: subscriber.external_tenant_id || null,
    external_user_id: subscriber.external_user_id || null,
    external_resource_id: subscriber.external_resource_id || null,
    channel_metadata: parseChannelMetadata(channel),
  };
  if (subscriber.subscriber_type === 'email' && subscriber.normalized_destination) {
    payload.normalized_destination = subscriber.normalized_destination;
  }
  const authorization = sanitizeAuthorization(config);
  if (authorization) payload.authorization = authorization;
  return payload;
}

async function loadChannel(db, channelId) {
  return db
    .prepare('SELECT * FROM channels WHERE id = ? OR channel_id = ? LIMIT 1')
    .bind(channelId, channelId)
    .first();
}

async function loadLifecycleSubscribers(db, workspaceId, channelId) {
  const result = await db
    .prepare(
      `SELECT * FROM subscribers
       WHERE workspace_id = ? AND channel_id = ? AND subscriber_type = 'webhook' AND mode = 'lifecycle' AND enabled = 1`,
    )
    .bind(workspaceId, channelId)
    .all();
  return result?.results || [];
}

export async function dispatchSubscriberLifecycleEvent({
  db,
  env,
  event,
  subscriber,
  now = new Date().toISOString(),
  fetchFn = fetch,
}) {
  if (!db || !subscriber?.workspace_id || !subscriber?.channel_id) {
    return { ok: true, dispatched: 0, skipped: true };
  }

  const [channel, targets] = await Promise.all([
    loadChannel(db, subscriber.channel_id),
    loadLifecycleSubscribers(db, subscriber.workspace_id, subscriber.channel_id),
  ]);
  if (targets.length === 0) return { ok: true, dispatched: 0 };

  const body = JSON.stringify(subscriberLifecyclePayload({ event, subscriber, channel, occurredAt: now }));
  const results = [];
  for (const target of targets) {
    const targetId = target.subscriber_id || target.id;
    const sourceId = subscriber.subscriber_id || subscriber.id;
    const deliveryId = stableId('sdl', `${event}:${sourceId}:${now}:${targetId}`);
    try {
      const signedHeaders = await buildSignedWebhookHeaders({
        body,
        deliveryId,
        subscriber: target,
        env,
        timestamp: Math.floor(Date.parse(now) / 1000),
      });
      const response = await fetchFn(target.destination_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...signedHeaders,
        },
        body,
      });
      results.push({ subscriber_id: targetId, status: response.status, ok: response.ok });
    } catch (error) {
      results.push({ subscriber_id: targetId, ok: false, error: error.message });
    }
  }
  return { ok: true, dispatched: results.length, results };
}
