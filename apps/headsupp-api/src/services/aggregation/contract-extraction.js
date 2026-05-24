function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getByPath(root, path) {
  if (!path) return undefined;
  return String(path)
    .split('.')
    .filter(Boolean)
    .reduce((current, segment) => {
      if (current === null || current === undefined) return undefined;
      return current[segment];
    }, root);
}

export function extractNumericValue(event, contract = {}) {
  const fromContract = getByPath(event, contract.value_path);
  if (Number.isFinite(fromContract)) return Number(fromContract);
  const fallback = event?.value?.num;
  if (Number.isFinite(fallback)) return Number(fallback);
  return null;
}

export function extractOccurredAt(event, contract = {}) {
  const candidate = getByPath(event, contract.time_path) ?? event?.occurred_at;
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function extractCta(event, contract = {}) {
  const candidate = getByPath(event, contract.cta_path);
  const cta = candidate === undefined ? event?.cta : candidate;
  if (cta === null || cta === undefined) return null;
  return isObject(cta) ? cta : null;
}

export function normalizeEventByContract(event, contract = {}) {
  const value = extractNumericValue(event, contract);
  if (value === null) {
    return {
      ok: false,
      code: 'INVALID_VALUE',
      message: 'Event does not contain a numeric value at contract value_path or value.num.',
    };
  }

  const occurredAt = extractOccurredAt(event, contract);
  if (!occurredAt) {
    return {
      ok: false,
      code: 'INVALID_OCCURRED_AT',
      message: 'Event does not contain a valid timestamp at contract time_path or occurred_at.',
    };
  }

  return {
    ok: true,
    event: {
      ...event,
      occurred_at: occurredAt,
      value: {
        ...event.value,
        num: value,
      },
      cta: extractCta(event, contract),
    },
  };
}
