import { stableId } from '../ids/stable-id.js';
import { buildAggregateForwardPayload } from './payload.js';

export async function createAggregateDelivery({ db, aggregate, signal, channel, subscriber, include, now }) {
  const payload = buildAggregateForwardPayload({ aggregate, signal, channel, include });
  const dimensionsHash = aggregate.dimensions_hash || 'd0';
  const delivery = {
    id: stableId(
      'aggdel',
      `${subscriber.subscriber_id || subscriber.id}:${aggregate.signal_id}:${aggregate.bucket_type}:${aggregate.bucket_start_at}:${dimensionsHash}`,
    ),
    subscriber_id: subscriber.subscriber_id || subscriber.id,
    signal_id: aggregate.signal_id,
    bucket_type: aggregate.bucket_type,
    bucket_start_at: aggregate.bucket_start_at,
    dimensions_hash: dimensionsHash,
    dimensions_json: aggregate.dimensions_json || '{}',
    status: 'pending',
    attempt_count: 0,
    payload_json: JSON.stringify(payload),
    last_attempt_at: null,
    next_retry_at: now,
    response_code: null,
    response_body: null,
    created_at: now,
    updated_at: now,
  };
  payload.delivery_id = delivery.id;
  payload.dedupe_key = `${delivery.subscriber_id}:${delivery.signal_id}:${delivery.bucket_type}:${delivery.bucket_start_at}:${delivery.dimensions_hash}`;
  delivery.payload_json = JSON.stringify(payload);

  await db
    .prepare(
      `INSERT OR IGNORE INTO aggregate_deliveries (
        id, subscriber_id, signal_id, bucket_type, bucket_start_at, dimensions_hash, dimensions_json, status, attempt_count, payload_json,
        last_attempt_at, next_retry_at, response_code, response_body, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      delivery.id,
      delivery.subscriber_id,
      delivery.signal_id,
      delivery.bucket_type,
      delivery.bucket_start_at,
      delivery.dimensions_hash,
      delivery.dimensions_json,
      delivery.status,
      delivery.attempt_count,
      delivery.payload_json,
      delivery.last_attempt_at,
      delivery.next_retry_at,
      delivery.response_code,
      delivery.response_body,
      delivery.created_at,
      delivery.updated_at,
    )
    .run();

  return delivery;
}

export async function enqueueAggregateDeliveries(queue, deliveries) {
  if (!queue?.sendBatch || deliveries.length === 0) return 0;
  await queue.sendBatch(deliveries.map((delivery) => ({ body: { aggregateDeliveryId: delivery.id } })));
  return deliveries.length;
}
