async function countFirst(db, sql, params = []) {
  const row = await db.prepare(sql).bind(...params).first();
  return Number(row?.count || row?.count_value || 0);
}

export async function getObservabilityOverview(db) {
  const [
    activeWatches,
    alertPending,
    alertRetrying,
    alertFailed,
    aggregatePending,
    aggregateRetrying,
    aggregateFailed,
    aggregateRows,
  ] = await Promise.all([
    countFirst(db, 'SELECT COUNT(*) AS count FROM watches WHERE enabled = 1'),
    countFirst(db, "SELECT COUNT(*) AS count FROM alert_deliveries WHERE status = 'pending'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM alert_deliveries WHERE status = 'retrying'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM alert_deliveries WHERE status = 'failed'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE status = 'pending'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE status = 'retrying'"),
    countFirst(db, "SELECT COUNT(*) AS count FROM aggregate_deliveries WHERE status = 'failed'"),
    countFirst(db, 'SELECT COUNT(*) AS count FROM aggregates'),
  ]);

  return {
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
  };
}
