import { evaluateClosedAggregateForwardWatches } from '../aggregate-forward/evaluator.js';
import { processAlertDeliveryMessage } from '../delivery/alert-delivery-consumer.js';
import { processAggregateDeliveryMessage } from '../delivery/aggregate-delivery-consumer.js';
import { processQuietSummaryDeliveryMessage } from '../delivery/quiet-summary.js';
import { evaluateDigestWatches } from '../scheduled-watches/digest.js';
import { evaluateMissingExpectedWatches } from '../scheduled-watches/missing-expected.js';
import { evaluateQuietSummaries } from '../scheduled-watches/quiet-summary.js';
import { evaluateReminderWatches } from '../scheduled-watches/reminder.js';
import { recordOperationalStatus } from '../operational/status.js';
import { cleanupRawEventDedupe } from './dedupe-cleanup.js';

async function loadRetryableDeliveries(db, table) {
  const processingCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const result = await db
    .prepare(
      `SELECT id FROM ${table}
       WHERE (status = 'retrying' AND next_retry_at <= ?)
          OR (status = 'processing' AND updated_at <= ?)
       LIMIT 100`,
    )
    .bind(new Date().toISOString(), processingCutoff)
    .all();
  return result?.results || [];
}

export async function processRetryableDeliveries(env, options = {}) {
  const alertRows = await loadRetryableDeliveries(env.DB, 'alert_deliveries');
  const aggregateRows = await loadRetryableDeliveries(env.DB, 'aggregate_deliveries');
  const quietSummaryRows = await loadRetryableDeliveries(env.DB, 'quiet_summary_deliveries');

  for (const row of alertRows) {
    await processAlertDeliveryMessage({ alertDeliveryId: row.id }, env, { ...options, reclaimProcessing: true });
  }
  for (const row of aggregateRows) {
    await processAggregateDeliveryMessage({ aggregateDeliveryId: row.id }, env, options);
  }
  for (const row of quietSummaryRows) {
    await processQuietSummaryDeliveryMessage({ quietSummaryDeliveryId: row.id }, env, options);
  }

  return {
    alert_retries: alertRows.length,
    aggregate_retries: aggregateRows.length,
    quiet_summary_retries: quietSummaryRows.length,
  };
}

export async function runScheduledTasks(env, _event = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  try {
    const missingExpected = await evaluateMissingExpectedWatches({
      db: env.DB,
      queue: env.ALERT_DELIVERY_QUEUE,
      now,
    });
    const reminders = await evaluateReminderWatches({
      db: env.DB,
      queue: env.ALERT_DELIVERY_QUEUE,
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
      queue: env.ALERT_DELIVERY_QUEUE,
      now,
    });
    const quietSummary = await evaluateQuietSummaries({
      db: env.DB,
      env,
      now,
      fetchFn: options.fetchFn,
      dispatch: options.dispatchQuietSummaries !== false,
    });
    const dedupeCleanup = await cleanupRawEventDedupe(env.DB, {
      now,
      retentionHours: Number(env.RAW_EVENT_DEDUPE_RETENTION_HOURS || 72),
    });

    const result = {
      missing_expected: missingExpected,
      reminders,
      aggregate_forward: aggregateForward,
      digest,
      quiet_summary: quietSummary,
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
