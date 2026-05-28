const FILTER_FIELDS = ['signal_keys', 'watch_group_keys', 'watch_keys', 'band_keys'];

function asCleanArray(value, field) {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_FILTERS',
      message: `config.filters.${field} must be an array of strings.`,
    };
  }
  const cleaned = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_SUBSCRIBER_FILTERS',
        message: `config.filters.${field} must be an array of strings.`,
      };
    }
    const next = item.trim();
    if (next) cleaned.push(next);
  }
  return { ok: true, value: Array.from(new Set(cleaned)) };
}

export function normalizeSubscriberAlertFilters(filters) {
  if (filters === undefined || filters === null) return { ok: true, filters: null };
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_FILTERS',
      message: 'config.filters must be an object when provided.',
    };
  }

  const normalized = {};
  for (const field of FILTER_FIELDS) {
    const result = asCleanArray(filters[field], field);
    if (!result.ok) return result;
    if (result.value.length > 0) normalized[field] = result.value;
  }

  return {
    ok: true,
    filters: Object.keys(normalized).length > 0 ? normalized : null,
  };
}

export function normalizeSubscriberConfigAlertFilters(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_CONFIG',
      message: 'config must be an object when provided.',
    };
  }
  const normalized = normalizeSubscriberAlertFilters(config.filters);
  if (!normalized.ok) return normalized;
  if (!normalized.filters) {
    const { filters, ...rest } = config;
    return { ok: true, config: rest };
  }
  return {
    ok: true,
    config: {
      ...config,
      filters: normalized.filters,
    },
  };
}

function parseConfig(subscriber) {
  if (!subscriber?.config_json) return subscriber?.config || {};
  try {
    return JSON.parse(subscriber.config_json);
  } catch {
    return {};
  }
}

function hasValues(filters) {
  return FILTER_FIELDS.some((field) => Array.isArray(filters?.[field]) && filters[field].length > 0);
}

function matchesAny(allowed, actualValues) {
  if (!Array.isArray(allowed) || allowed.length === 0) return false;
  const actual = new Set(actualValues.filter(Boolean).map(String));
  return allowed.some((value) => actual.has(String(value)));
}

export function subscriberMatchesAlertFilters(subscriber, context = {}) {
  const filters = parseConfig(subscriber).filters;
  if (!hasValues(filters)) return true;

  return (
    matchesAny(filters.signal_keys, [context.signal_key]) ||
    matchesAny(filters.watch_group_keys, [context.watch_group_key]) ||
    matchesAny(filters.watch_keys, [context.watch_key, context.watch_id]) ||
    matchesAny(filters.band_keys, [context.band_key])
  );
}
