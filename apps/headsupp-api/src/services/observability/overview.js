import { loadOperationalStatus } from '../operational/status.js';

async function countFirst(db, sql, params = []) {
  const row = await db.prepare(sql).bind(...params).first();
  return Number(row?.count || row?.count_value || 0);
}

function healthFromCounts({ alertRetrying, alertFailed, aggregateRetrying, aggregateFailed, cronStatus }) {
  if (cronStatus?.status === 'error') return 'error';
  if (alertFailed > 0 || aggregateFailed > 0) return 'degraded';
  if (alertRetrying > 0 || aggregateRetrying > 0) return 'watch';
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
  ]);
  const cronStatus = await loadOperationalStatus(db, 'scheduled_tasks');
  const health = healthFromCounts({ alertRetrying, alertFailed, aggregateRetrying, aggregateFailed, cronStatus });

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
