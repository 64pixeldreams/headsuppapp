export const AGGREGATE_UPSERT_SQL = `INSERT INTO aggregates (
  id,
  workspace_id,
  channel_id,
  signal_id,
  bucket_type,
  bucket_start_at,
  dimensions_hash,
  dimensions_json,
  sum_value,
  count_value,
  min_value,
  max_value,
  last_value,
  avg_value,
  first_event_at,
  last_event_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(signal_id, bucket_type, bucket_start_at, dimensions_hash)
DO UPDATE SET
  sum_value = aggregates.sum_value + excluded.sum_value,
  count_value = aggregates.count_value + excluded.count_value,
  dimensions_json = excluded.dimensions_json,
  min_value = CASE
    WHEN aggregates.min_value IS NULL THEN excluded.min_value
    WHEN excluded.min_value IS NULL THEN aggregates.min_value
    ELSE MIN(aggregates.min_value, excluded.min_value)
  END,
  max_value = CASE
    WHEN aggregates.max_value IS NULL THEN excluded.max_value
    WHEN excluded.max_value IS NULL THEN aggregates.max_value
    ELSE MAX(aggregates.max_value, excluded.max_value)
  END,
  last_value = CASE
    WHEN excluded.last_event_at >= aggregates.last_event_at THEN excluded.last_value
    ELSE aggregates.last_value
  END,
  avg_value = (aggregates.sum_value + excluded.sum_value) / (aggregates.count_value + excluded.count_value),
  last_event_at = CASE
    WHEN excluded.last_event_at > aggregates.last_event_at THEN excluded.last_event_at
    ELSE aggregates.last_event_at
  END,
  updated_at = excluded.updated_at`;

export async function upsertAggregateDelta(db, delta) {
  await db
    .prepare(AGGREGATE_UPSERT_SQL)
    .bind(
      delta.id,
      delta.workspace_id,
      delta.channel_id,
      delta.signal_id,
      delta.bucket_type,
      delta.bucket_start_at,
      delta.dimensions_hash || 'd0',
      delta.dimensions_json || '{}',
      delta.sum_value,
      delta.count_value,
      delta.min_value,
      delta.max_value,
      delta.last_value,
      delta.avg_value,
      delta.first_event_at,
      delta.last_event_at,
      delta.updated_at,
    )
    .run();

  return delta;
}

export async function upsertAggregateDeltas(db, deltas) {
  for (const delta of deltas) {
    await upsertAggregateDelta(db, delta);
  }
  return {
    upserted: deltas.length,
  };
}
