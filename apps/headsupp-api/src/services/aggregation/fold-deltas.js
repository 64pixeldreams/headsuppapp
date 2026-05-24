function aggregateKey(delta) {
  return [
    delta.workspace_id,
    delta.channel_id,
    delta.signal_id,
    delta.bucket_type,
    delta.bucket_start_at,
  ].join('|');
}

export function foldAggregateDeltas(deltas) {
  const folded = new Map();

  for (const delta of deltas) {
    const key = aggregateKey(delta);
    const current = folded.get(key);
    if (!current) {
      folded.set(key, { ...delta });
      continue;
    }

    current.sum_value += delta.sum_value;
    current.count_value += delta.count_value;
    current.min_value = Math.min(current.min_value, delta.min_value);
    current.max_value = Math.max(current.max_value, delta.max_value);
    current.avg_value = current.sum_value / current.count_value;

    if (delta.first_event_at < current.first_event_at) {
      current.first_event_at = delta.first_event_at;
    }

    if (delta.last_event_at >= current.last_event_at) {
      current.last_event_at = delta.last_event_at;
      current.last_value = delta.last_value;
    }

    if (delta.updated_at > current.updated_at) {
      current.updated_at = delta.updated_at;
    }
  }

  return Array.from(folded.values());
}
