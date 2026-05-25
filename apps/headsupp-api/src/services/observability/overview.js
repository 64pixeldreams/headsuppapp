import { loadOperationalStatus } from '../operational/status.js';

async function countFirst(db, sql, params = []) {
  const row = await db.prepare(sql).bind(...params).first();
  return Number(row?.count || row?.count_value || 0);
}

async function groupedRows(db, sql, params = []) {
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.all !== 'function') return [];
  const result = await prepared.all();
  return result?.results || [];
}

function healthFromCounts({ alertRetrying, alertFailed, aggregateRetrying, aggregateFailed, quietSummaryRetrying, quietSummaryFailed, cronStatus }) {
  if (cronStatus?.status === 'error') return 'error';
  if (alertFailed > 0 || aggregateFailed > 0 || quietSummaryFailed > 0) return 'degraded';
  if (alertRetrying > 0 || aggregateRetrying > 0 || quietSummaryRetrying > 0) return 'watch';
  return 'ok';
}

export async function getObservabilityOverview(db, { now = new Date().toISOString() } = {}) {
  const oldPendingBefore = new Date(Date.parse(now) - 15 * 60 * 1000).toISOString();
  const [
    activeWatches,
    alertPending,
    alertRetrying,
    alertFailed,
    aggregatePending,
    aggregateRetrying,
    aggregateFailed,
    aggregateRows,
    dueAlertRetries,
    dueAggregateRetries,
    oldAlertPending,
    oldAggregatePending,
    quietSummaryPending,
    quietSummaryRetrying,
    quietSummaryFailed,
  ] = await Promise.all([
    countFirst(db, 'SELECT COUNT(*) AS count FROM watches WHERE enabled = 1'),
    countFirst(db, "SELECT COUNT(*) AS count FROM alert_deliveries WHERE status = 'pending'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM alert_deliveries WHERE status = 'retrying'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM alert_deliveries WHERE status = 'failed'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE status = 'pending'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE status = 'retrying'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE status = 'failed'"),
    countFirst(db, 'SELECT COUNT(*) AS count FROM aggregates'),
    countFirst(db, "SELECT COUNT(*) AS count FROM alert_deliveries WHERE status = 'retrying' AND next_retry_at <= ?", [now]),
    countFirst(db, "SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE status = 'retrying' AND next_retry_at <= ?", [now]),
    countFirst(db, "SELECT COUNT(*) AS count FROM alert_deliveries WHERE status = 'pending' AND created_at <= ?", [oldPendingBefore]),
    countFirst(db, "SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE status = 'pending' AND created_at <= ?", [oldPendingBefore]),
    countFirst(db, "SELECT COUNT(*) AS count FROM quiet_summary_deliveries WHERE status = 'pending'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM quiet_summary_deliveries WHERE status = 'retrying'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM quiet_summary_deliveries WHERE status = 'failed'"),
  ]);
  const cronStatus = await loadOperationalStatus(db, 'scheduled_tasks');
  const alertDeliveryBreakdown = await groupedRows(
    db,
    `SELECT
       COALESCE(sub.subscriber_type, 'unknown') AS subscriber_type,
       COALESCE(alert.severity, 'unknown') AS severity,
       COALESCE(json_extract(delivery.response_body, '$.template_id'), 'unknown') AS template_id,
       SUM(CASE WHEN delivery.status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
       SUM(CASE WHEN delivery.status = 'retrying' THEN 1 ELSE 0 END) AS retrying_count,
       SUM(CASE WHEN delivery.status = 'failed' THEN 1 ELSE 0 END) AS failed_count
     FROM alert_deliveries delivery
     LEFT JOIN subscribers sub
       ON sub.id = delivery.subscriber_id OR sub.subscriber_id = delivery.subscriber_id
     LEFT JOIN alerts alert
       ON alert.id = delivery.alert_id
     GROUP BY subscriber_type, severity, template_id`,
  );
  const health = healthFromCounts({
    alertRetrying,
    alertFailed,
    aggregateRetrying,
    aggregateFailed,
    quietSummaryRetrying,
    quietSummaryFailed,
    cronStatus,
  });

  return {
    status: health,
    active_watches: activeWatches,
    aggregate_rows: aggregateRows,
    deliveries: {
      alerts: {
        pending: alertPending,
        retrying: alertRetrying,
        failed: alertFailed,
      },
      aggregates: {
        pending: aggregatePending,
        retrying: aggregateRetrying,
        failed: aggregateFailed,
      },
      quiet_summaries: {
        pending: quietSummaryPending,
        retrying: quietSummaryRetrying,
        failed: quietSummaryFailed,
      },
      alert_breakdown: alertDeliveryBreakdown.map((row) => ({
        subscriber_type: row.subscriber_type,
        severity: row.severity,
        template_id: row.template_id,
        sent: Number(row.sent_count || 0),
        retrying: Number(row.retrying_count || 0),
        failed: Number(row.failed_count || 0),
      })),
    },
    operator_health: {
      retry_backlog: {
        alerts_due: dueAlertRetries,
        aggregates_due: dueAggregateRetries,
      },
      old_pending: {
        alerts: oldAlertPending,
        aggregates: oldAggregatePending,
      },
      scheduled_tasks: cronStatus
        ? {
            status: cronStatus.status,
            last_success_at: cronStatus.last_success_at,
            last_failure_at: cronStatus.last_failure_at,
            last_error_code: cronStatus.last_error_code,
            last_error_message: cronStatus.last_error_message,
            updated_at: cronStatus.updated_at,
          }
        : null,
    },
  };
}
