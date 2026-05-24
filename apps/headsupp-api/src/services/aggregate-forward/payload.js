export function bucketEndAt(bucketStartAt, bucketType) {
  const date = new Date(bucketStartAt);
  if (bucketType === 'hour') date.setUTCHours(date.getUTCHours() + 1);
  else if (bucketType === 'day') date.setUTCDate(date.getUTCDate() + 1);
  else if (bucketType === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCMinutes(date.getUTCMinutes() + 1);
  return date.toISOString();
}

export function buildAggregateForwardPayload({ aggregate, signal, channel, include = {} }) {
  const values = {};
  if (include.sum !== false) values.sum = aggregate.sum_value;
  if (include.count !== false) values.count = aggregate.count_value;
  if (include.avg !== false) values.avg = aggregate.avg_value;
  if (include.min !== false) values.min = aggregate.min_value;
  if (include.max !== false) values.max = aggregate.max_value;
  if (include.last !== false) values.last = aggregate.last_value;

  return {
    source: 'heads_up',
    event_type: 'aggregate_bucket_closed',
    signal_key: signal.signal_key,
    workspace_id: aggregate.workspace_id,
    channel_id: aggregate.channel_id,
    bucket: {
      type: aggregate.bucket_type,
      start_at: aggregate.bucket_start_at,
      end_at: bucketEndAt(aggregate.bucket_start_at, aggregate.bucket_type),
    },
    values,
    cta: channel?.channel_id
      ? {
          label: 'View channel',
          url: `https://headsupp_app.example.workers.dev/channels/${channel.channel_id}`,
        }
      : null,
  };
}
