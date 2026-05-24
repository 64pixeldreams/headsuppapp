const WATCH_TYPES = new Set([
  'LAST_VALUE_LT',
  'LAST_VALUE_GT',
  'WINDOW_AVG_LT',
  'WINDOW_AVG_GT',
  'WINDOW_SUM_GT',
  'WINDOW_COUNT_GT',
]);

export function parseWatchJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function watchConfig(watch) {
  const config = parseWatchJson(watch.config_json);
  return {
    field: config.field || watch.field || 'last_value',
    threshold: Number(config.threshold ?? watch.threshold),
    bucket_type: config.bucket_type || watch.bucket_type || 'minute',
    severity: config.severity || watch.severity || 'warning',
    window: config.window || watch.window || null,
  };
}

function windowStats(aggregates) {
  const sum = aggregates.reduce((total, row) => total + Number(row.sum_value || 0), 0);
  const count = aggregates.reduce((total, row) => total + Number(row.count_value || 0), 0);
  return {
    sum,
    count,
    avg: count > 0 ? sum / count : null,
  };
}

export function evaluateWatchAgainstAggregates(watch, aggregates = []) {
  if (!WATCH_TYPES.has(watch.watch_type)) {
    return {
      supported: false,
      triggered: false,
      reason: 'UNSUPPORTED_WATCH_TYPE',
    };
  }

  const config = watchConfig(watch);
  const latest = aggregates[aggregates.length - 1] || null;
  const stats = windowStats(aggregates);
  let currentValue = null;
  let triggered = false;

  if (watch.watch_type === 'LAST_VALUE_LT' || watch.watch_type === 'LAST_VALUE_GT') {
    currentValue = latest ? Number(latest.last_value) : null;
    triggered =
      currentValue !== null &&
      (watch.watch_type === 'LAST_VALUE_LT' ? currentValue < config.threshold : currentValue > config.threshold);
  }

  if (watch.watch_type === 'WINDOW_AVG_LT' || watch.watch_type === 'WINDOW_AVG_GT') {
    currentValue = stats.avg;
    triggered =
      currentValue !== null &&
      (watch.watch_type === 'WINDOW_AVG_LT' ? currentValue < config.threshold : currentValue > config.threshold);
  }

  if (watch.watch_type === 'WINDOW_SUM_GT') {
    currentValue = stats.sum;
    triggered = currentValue > config.threshold;
  }

  if (watch.watch_type === 'WINDOW_COUNT_GT') {
    currentValue = stats.count;
    triggered = currentValue > config.threshold;
  }

  return {
    supported: true,
    triggered,
    current_value: currentValue,
    threshold: config.threshold,
    severity: config.severity,
    bucket_type: config.bucket_type,
  };
}
