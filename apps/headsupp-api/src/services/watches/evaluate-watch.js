const WATCH_TYPES = new Set([
  'EVENT_OCCURRENCE',
  'LAST_VALUE_LT',
  'LAST_VALUE_GT',
  'WINDOW_AVG_LT',
  'WINDOW_AVG_GT',
  'WINDOW_SUM_GT',
  'WINDOW_COUNT_GT',
  'DELTA_LT',
  'DELTA_GT',
  'PERCENT_CHANGE_GT',
  'PERCENT_CHANGE_LT',
  'PREVIOUS_PERIOD_RATIO_GT',
  'PREVIOUS_PERIOD_RATIO_LT',
  'SPIKE_GT',
  'TREND_UP_GT',
  'TREND_DOWN_GT',
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
    method: config.method || 'first_last_percent_change',
  };
}

function getPathValue(source, path) {
  if (!path) return undefined;
  if (path === 'idempotency_key') return source?.idempotency_key;
  const parts = String(path).split('.').filter(Boolean);
  const value = parts.reduce((current, segment) => {
    if (current === null || current === undefined) return undefined;
    return current[segment];
  }, source);
  if (value === undefined && parts.length === 1) return source?.fields?.[path];
  return value;
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function normalizeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [];
}

export function evaluateEventOccurrence(watch, eventContext = {}) {
  const config = parseWatchJson(watch.config_json);
  const fields = eventContext?.fields && typeof eventContext.fields === 'object' ? eventContext.fields : {};
  const eventType = fields.event_type || eventContext.event_type || null;
  if (config.event_type && eventType !== config.event_type) {
    return {
      supported: true,
      triggered: false,
      reason: 'EVENT_TYPE_NOT_MATCHED',
      current_value: null,
      threshold: null,
      severity: config.severity || 'info',
      bucket_type: config.bucket_type || 'event',
      fields,
    };
  }

  const missingField = normalizeArray(config.required_fields).find((path) => !hasValue(getPathValue(eventContext, path)));
  if (missingField) {
    return {
      supported: true,
      triggered: false,
      reason: 'REQUIRED_FIELD_MISSING',
      missing_field: missingField,
      current_value: null,
      threshold: null,
      severity: config.severity || 'info',
      bucket_type: config.bucket_type || 'event',
      fields,
    };
  }

  const dedupePath = config.dedupe_key_path || 'idempotency_key';
  const occurrenceKey = getPathValue(eventContext, dedupePath);
  if (!hasValue(occurrenceKey)) {
    return {
      supported: true,
      triggered: false,
      reason: 'OCCURRENCE_KEY_MISSING',
      current_value: null,
      threshold: null,
      severity: config.severity || 'info',
      bucket_type: config.bucket_type || 'event',
      fields,
    };
  }

  const outcomePath = config.outcome_path || 'fields.outcome';
  const outcome = getPathValue(eventContext, outcomePath);
  const templateByOutcome = config.template_by_outcome && typeof config.template_by_outcome === 'object'
    ? config.template_by_outcome
    : {};
  const selectedTemplate = templateByOutcome[outcome] || config.template_id || fields.email?.template_id || null;
  const severityFromPath = config.severity_path ? getPathValue(eventContext, config.severity_path) : null;
  const severity = severityFromPath || config.severity || fields.severity || (fields.tone === 'success' ? 'success' : 'info');
  const value = Number(eventContext?.value?.num ?? eventContext?.value ?? 1);
  const currentValue = Number.isFinite(value) ? value : 1;
  const nextFields = {
    ...fields,
    ...(selectedTemplate ? { email: { ...(fields.email || {}), template_id: selectedTemplate } } : {}),
    occurrence: {
      key: String(occurrenceKey),
      dedupe_key_path: dedupePath,
      event_type: eventType,
      outcome: outcome || null,
    },
  };

  return {
    supported: true,
    triggered: true,
    reason: null,
    current_value: currentValue,
    threshold: null,
    severity,
    bucket_type: 'event',
    occurrence_key: String(occurrenceKey),
    occurrence_dedupe_key_path: dedupePath,
    summary_text: fields.notification?.summary || `${watch.name || 'Event occurrence'} occurred.`,
    cta: eventContext.cta || null,
    fields: nextFields,
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

function latestPair(aggregates) {
  if (aggregates.length < 2) return null;
  const previous = Number(aggregates[aggregates.length - 2]?.last_value);
  const latest = Number(aggregates[aggregates.length - 1]?.last_value);
  if (!Number.isFinite(previous) || !Number.isFinite(latest)) return null;
  return { previous, latest };
}

function valueForField(row, field) {
  const value = row?.[field] ?? row?.last_value;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function trendStats(aggregates, field) {
  if (aggregates.length < 2) return { ok: false, reason: 'INSUFFICIENT_TREND_BUCKETS' };
  const first = valueForField(aggregates[0], field);
  const latest = valueForField(aggregates[aggregates.length - 1], field);
  if (first === null || latest === null) return { ok: false, reason: 'INVALID_TREND_VALUES' };
  if (first === 0) return { ok: false, reason: 'TREND_FIRST_VALUE_ZERO' };
  const percent = ((latest - first) / Math.abs(first)) * 100;
  return {
    ok: true,
    first,
    latest,
    percent,
    bucket_count: aggregates.length,
  };
}

export function evaluateWatchAgainstAggregates(watch, aggregates = []) {
  if (watch.watch_type === 'EVENT_OCCURRENCE') {
    return {
      supported: false,
      triggered: false,
      reason: 'EVENT_CONTEXT_REQUIRED',
    };
  }

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
  let reason = null;
  let fields = null;

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

  if (watch.watch_type === 'DELTA_LT' || watch.watch_type === 'DELTA_GT') {
    const pair = latestPair(aggregates);
    if (pair) {
      currentValue = pair.latest - pair.previous;
      triggered = watch.watch_type === 'DELTA_LT' ? currentValue < config.threshold : currentValue > config.threshold;
    }
  }

  if (watch.watch_type === 'PERCENT_CHANGE_LT' || watch.watch_type === 'PERCENT_CHANGE_GT' || watch.watch_type === 'SPIKE_GT') {
    const pair = latestPair(aggregates);
    if (pair && pair.previous !== 0) {
      currentValue = ((pair.latest - pair.previous) / Math.abs(pair.previous)) * 100;
      triggered =
        watch.watch_type === 'PERCENT_CHANGE_LT' ? currentValue < config.threshold : currentValue > config.threshold;
    }
  }

  if (watch.watch_type === 'PREVIOUS_PERIOD_RATIO_LT' || watch.watch_type === 'PREVIOUS_PERIOD_RATIO_GT') {
    const pair = latestPair(aggregates);
    if (pair && pair.previous !== 0) {
      currentValue = pair.latest / pair.previous;
      triggered =
        watch.watch_type === 'PREVIOUS_PERIOD_RATIO_LT'
          ? currentValue < config.threshold
          : currentValue > config.threshold;
    }
  }

  if (watch.watch_type === 'TREND_UP_GT' || watch.watch_type === 'TREND_DOWN_GT') {
    const trend = trendStats(aggregates, config.field);
    if (!trend.ok) {
      reason = trend.reason;
    } else {
      currentValue = trend.percent;
      triggered =
        watch.watch_type === 'TREND_UP_GT'
          ? currentValue > config.threshold
          : currentValue < -Math.abs(config.threshold);
      fields = {
        trend: {
          method: config.method,
          field: config.field,
          first_value: trend.first,
          latest_value: trend.latest,
          trend_percent: trend.percent,
          bucket_count: trend.bucket_count,
          window_size: config.window?.size || trend.bucket_count,
          direction: trend.percent >= 0 ? 'up' : 'down',
        },
      };
    }
  }

  return {
    supported: true,
    triggered,
    reason,
    current_value: currentValue,
    threshold: config.threshold,
    severity: config.severity,
    bucket_type: config.bucket_type,
    fields,
  };
}
