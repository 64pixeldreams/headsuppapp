const BUCKET_TYPES = new Set(['minute', 'hour', 'day', 'month']);

export function bucketStartAt(occurredAt, bucketType) {
  if (!BUCKET_TYPES.has(bucketType)) {
    throw new Error(`Unsupported bucket type: ${bucketType}`);
  }

  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error('occurred_at must be a valid timestamp.');
  }

  if (bucketType === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
  }
  if (bucketType === 'day') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)).toISOString();
  }
  if (bucketType === 'hour') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), 0, 0, 0)).toISOString();
  }
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), 0, 0),
  ).toISOString();
}

export function extractDimensions(event, dimensions = []) {
  return Object.fromEntries(dimensions.map((dimension) => [dimension, event.fields?.[dimension] ?? null]));
}

export function eventToAggregateDeltas({ message, signal, contract, now = new Date().toISOString() }) {
  const bucketTypes = contract.default_bucket_types || ['minute', 'hour', 'day'];
  const dimensions = extractDimensions(message.event, contract.dimensions || []);
  const value = message.event.value.num;

  return bucketTypes.map((bucketType) => ({
    id: `${signal.id}:${bucketType}:${bucketStartAt(message.event.occurred_at, bucketType)}`,
    workspace_id: message.workspaceId,
    channel_id: message.channelId,
    signal_id: signal.id,
    signal_key: signal.signal_key,
    bucket_type: bucketType,
    bucket_start_at: bucketStartAt(message.event.occurred_at, bucketType),
    dimensions,
    sum_value: value,
    count_value: 1,
    min_value: value,
    max_value: value,
    last_value: value,
    avg_value: value,
    first_event_at: message.event.occurred_at,
    last_event_at: message.event.occurred_at,
    updated_at: now,
  }));
}
