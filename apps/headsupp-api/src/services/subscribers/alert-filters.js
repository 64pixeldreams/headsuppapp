const FILTER_FIELDS = ['signal_keys', 'watch_group_keys', 'watch_keys', 'band_keys'];
const DIMENSION_FILTER_FIELD = 'dimensions';

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

function normalizeDimensionFilters(value) {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SUBSCRIBER_FILTERS',
      message: `config.filters.${DIMENSION_FILTER_FIELD} must be an object of string arrays.`,
    };
  }
  const normalized = {};
  for (const [key, allowed] of Object.entries(value)) {
    const dimensionKey = String(key || '').trim();
    if (!dimensionKey) continue;
    const result = asCleanArray(allowed, `${DIMENSION_FILTER_FIELD}.${dimensionKey}`);
    if (!result.ok) return result;
    if (result.value.length > 0) normalized[dimensionKey] = result.value;
  }
  return { ok: true, value: normalized };
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

  // `dimensions` (alias: `fields`) scopes alerts by event dimension values such
  // as forecast_id. Stored canonically under `dimensions`.
  const dimensionInput = filters[DIMENSION_FILTER_FIELD] ?? filters.fields;
  const dimensions = normalizeDimensionFilters(dimensionInput);
  if (!dimensions.ok) return dimensions;
  if (Object.keys(dimensions.value).length > 0) normalized[DIMENSION_FILTER_FIELD] = dimensions.value;

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

function hasTypeValues(filters) {
  return FILTER_FIELDS.some((field) => Array.isArray(filters?.[field]) && filters[field].length > 0);
}

function hasDimensionValues(filters) {
  const dimensions = filters?.[DIMENSION_FILTER_FIELD];
  return Boolean(dimensions && typeof dimensions === 'object' && Object.keys(dimensions).length > 0);
}

function hasValues(filters) {
  return hasTypeValues(filters) || hasDimensionValues(filters);
}

function matchesAny(allowed, actualValues) {
  if (!Array.isArray(allowed) || allowed.length === 0) return false;
  const actual = new Set(actualValues.filter(Boolean).map(String));
  return allowed.some((value) => actual.has(String(value)));
}

function lookupPath(source, path) {
  if (!source || typeof source !== 'object') return undefined;
  return String(path)
    .split('.')
    .filter(Boolean)
    .reduce((current, segment) => (current === null || current === undefined ? undefined : current[segment]), source);
}

// Dimension scope is an AND across configured keys; within a key the allowed
// values are OR. An absent value never matches a configured dimension.
function matchesDimensionFilters(dimensions, context) {
  if (!hasDimensionValues({ [DIMENSION_FILTER_FIELD]: dimensions })) return true;
  const fields = context.fields || {};
  return Object.entries(dimensions).every(([key, allowed]) => {
    const actual = lookupPath(fields, key);
    return matchesAny(allowed, [actual]);
  });
}

export function subscriberMatchesAlertFilters(subscriber, context = {}) {
  const filters = parseConfig(subscriber).filters;
  if (!hasValues(filters)) return true;

  const typeMatch =
    !hasTypeValues(filters) ||
    matchesAny(filters.signal_keys, [context.signal_key]) ||
    matchesAny(filters.watch_group_keys, [context.watch_group_key]) ||
    matchesAny(filters.watch_keys, [context.watch_key, context.watch_id]) ||
    matchesAny(filters.band_keys, [context.band_key]);

  const dimensionMatch = matchesDimensionFilters(filters[DIMENSION_FILTER_FIELD], context);

  return typeMatch && dimensionMatch;
}
