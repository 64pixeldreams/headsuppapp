import { evaluateClosedAggregateForwardWatches } from '../aggregate-forward/evaluator.js';
import { processAlertDeliveryMessage } from '../delivery/alert-delivery-consumer.js';
import { processAggregateDeliveryMessage } from '../delivery/aggregate-delivery-consumer.js';
import { evaluateDigestWatches } from '../scheduled-watches/digest.js';
import { evaluateMissingExpectedWatches } from '../scheduled-watches/missing-expected.js';
import { recordOperationalStatus } from '../operational/status.js';
import { cleanupRawEventDedupe } from './dedupe-cleanup.js';

async function loadRetryableDeliveries(db, table) {
  const result = await db
    .prepare(`SELECT id FROM ${table} WHERE status = 'retrying' AND next_retry_at <= ? LIMIT 100`)
    .bind(new Date().toISOString())
    .all();
  return result?.results || [];
}

export async function processRetryableDeliveries(env, options = {}) {
  const alertRows = await loadRetryableDeliveries(env.DB, 'alert_deliveries');
  const aggregateRows = await loadRetryableDeliveries(env.DB, 'aggregate_deliveries');

  for (const row of alertRows) {
    await processAlertDeliveryMessage({ alertDeliveryId: row.id }, env, options);
  }
  for (const row of aggregateRows) {
    await processAggregateDeliveryMessage({ aggregateDeliveryId: row.id }, env, options);
  }

  return {
    alert_retries: alertRows.length,
    aggregate_retries: aggregateRows.length,
  };
}

export async function runScheduledTasks(env, _event = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  try {
    const missingExpected = await evaluateMissingExpectedWatches({
      db: env.DB,
      now,
    });
    const aggregateForward = await evaluateClosedAggregateForwardWatches({
      db: env.DB,
      queue: env.AGGREGATE_DELIVERY_QUEUE,
      now,
    });
    const retries = await processRetryableDeliveries(env, { ...options, now });
    const digest = await evaluateDigestWatches({
      db: env.DB,
      now,
    });
    const dedupeCleanup = await cleanupRawEventDedupe(env.DB, {
      now,
      retentionHours: Number(env.RAW_EVENT_DEDUPE_RETENTION_HOURS || 72),
    });

    const result = {
      missing_expected: missingExpected,
      aggregate_forward: aggregateForward,
      digest,
      dedupe_cleanup: dedupeCleanup,
      retries,
    };
    await recordOperationalStatus({
      db: env.DB,
      key: 'scheduled_tasks',
      status: 'ok',
      metadata: result,
      now,
    });
    return result;
  } catch (error) {
    await recordOperationalStatus({
      db: env.DB,
      key: 'scheduled_tasks',
      status: 'error',
      error,
      now,
    });
    throw error;
  }
}
