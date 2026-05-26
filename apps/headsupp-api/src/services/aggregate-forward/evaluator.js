import { parseWatchJson } from '../watches/evaluate-watch.js';
import { createAggregateDelivery, enqueueAggregateDeliveries } from './delivery.js';
import { dimensionsHash } from '../aggregation/buckets.js';

function closedBefore(now, bucketType, graceSeconds = 60) {
  const date = new Date(now);
  date.setUTCSeconds(date.getUTCSeconds() - graceSeconds);
  if (bucketType === 'month') {
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
  } else if (bucketType === 'week') {
    const day = date.getUTCDay();
    const daysSinceMonday = (day + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
    date.setUTCHours(0, 0, 0, 0);
  } else if (bucketType === 'day') {
    date.setUTCHours(0, 0, 0, 0);
  } else if (bucketType === 'hour') {
    date.setUTCMinutes(0, 0, 0);
  } else {
    date.setUTCSeconds(0, 0);
  }
  return date.toISOString();
}

export async function loadAggregateForwardWatches(db) {
  const result = await db
    .prepare("SELECT * FROM watches WHERE watch_type = 'AGGREGATE_FORWARD' AND enabled = 1")
    .all();
  return result?.results || [];
}

export async function evaluateAggregateForwardWatch({ db, queue, watch, now = new Date().toISOString() }) {
  const config = parseWatchJson(watch.config_json);
  const bucketType = config.bucket_type || 'hour';
  const configuredDimensionsHash = config.dimensions ? dimensionsHash(config.dimensions) : null;
  const cutoff = closedBefore(now, bucketType, config.emit_after_grace_seconds ?? 60);
  const aggregateResult = await db
    .prepare(
      `SELECT *
       FROM aggregates
       WHERE signal_id = ? AND bucket_type = ? AND bucket_start_at < ?
         AND (? IS NULL OR dimensions_hash = ?)
       ORDER BY bucket_start_at ASC
       LIMIT 100`,
    )
    .bind(watch.signal_id, bucketType, cutoff, configuredDimensionsHash, configuredDimensionsHash)
    .all();
  const aggregates = aggregateResult?.results || [];
  const subscriber = await db
    .prepare('SELECT * FROM subscribers WHERE id = ? OR subscriber_id = ? LIMIT 1')
    .bind(config.subscriber_id, config.subscriber_id)
    .first();
  const signal = await db.prepare('SELECT * FROM signals WHERE id = ? LIMIT 1').bind(watch.signal_id).first();
  const channel = await db.prepare('SELECT * FROM channels WHERE id = ? OR channel_id = ? LIMIT 1').bind(
    watch.channel_id,
    watch.channel_id,
  ).first();

  if (!subscriber || !signal) return { created: 0, enqueued: 0 };

  const deliveries = [];
  for (const aggregate of aggregates) {
    deliveries.push(
      await createAggregateDelivery({
        db,
        aggregate,
        signal,
        channel,
        subscriber,
        include: config.include,
        now,
      }),
    );
  }

  const created = deliveries.filter((delivery) => delivery.inserted !== false).length;
  return {
    created,
    existing: deliveries.length - created,
    enqueued: await enqueueAggregateDeliveries(queue, deliveries),
  };
}

export async function evaluateClosedAggregateForwardWatches({ db, queue, now = new Date().toISOString() }) {
  const watches = await loadAggregateForwardWatches(db);
  let created = 0;
  let existing = 0;
  let enqueued = 0;
  for (const watch of watches) {
    const result = await evaluateAggregateForwardWatch({ db, queue, watch, now });
    created += result.created;
    existing += result.existing || 0;
    enqueued += result.enqueued;
  }
  return { watches: watches.length, created, existing, enqueued };
}
