const BUCKET_TYPES = new Set(['minute', 'hour', 'day', 'week', 'month']);

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
  if (bucketType === 'week') {
    const day = date.getUTCDay();
    const daysSinceMonday = (day + 6) % 7;
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday, 0, 0, 0, 0),
    ).toISOString();
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
  return Object.fromEntries(
    dimensions.map((dimension) => {
      const path = String(dimension || '');
      const parts = path.split('.').filter(Boolean);
      const value = parts.reduce((current, segment) => {
        if (current === null || current === undefined) return undefined;
        return current[segment];
      }, event.fields || {});
      return [path, value ?? null];
    }),
  );
}

function stableDimensionsJson(dimensions) {
  const sorted = Object.keys(dimensions || {})
    .sort()
    .reduce((acc, key) => {
      acc[key] = dimensions[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

export function dimensionsHash(dimensions) {
  const json = stableDimensionsJson(dimensions);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `d${(hash >>> 0).toString(16)}`;
}

export function eventToAggregateDeltas({ message, signal, contract, now = new Date().toISOString() }) {
  const bucketTypes = contract.default_bucket_types || ['minute', 'hour', 'day'];
  const dimensions = extractDimensions(message.event, contract.dimensions || []);
  const dimensions_json = stableDimensionsJson(dimensions);
  const dimensions_hash = dimensionsHash(dimensions);
  const value = message.event.value.num;

  return bucketTypes.map((bucketType) => ({
    id: `${signal.id}:${bucketType}:${bucketStartAt(message.event.occurred_at, bucketType)}:${dimensions_hash}`,
    workspace_id: message.workspaceId,
    channel_id: message.channelId,
    signal_id: signal.id,
    signal_key: signal.signal_key,
    bucket_type: bucketType,
    bucket_start_at: bucketStartAt(message.event.occurred_at, bucketType),
    dimensions,
    dimensions_json,
    dimensions_hash,
    event_context: {
      cta: message.event.cta || null,
      fields: message.event.fields || {},
      idempotency_key: message.event.idempotency_key || null,
      occurred_at: message.event.occurred_at || null,
      signal_key: message.event.signal_key || null,
      value: message.event.value || null,
    },
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
