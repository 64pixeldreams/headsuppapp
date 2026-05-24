const MAX_BATCH_EVENTS = 1000;

function error(code, message) {
  return {
    ok: false,
    status: 400,
    code,
    message,
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateIncomingEvent(event, index = 0) {
  if (!isObject(event)) {
    return error('INVALID_EVENT', `Event at index ${index} must be an object.`);
  }

  const signalKey = cleanString(event.signal_key);
  if (!signalKey) {
    return error('MISSING_SIGNAL_KEY', `Event at index ${index} requires signal_key.`);
  }

  const occurredAt = cleanString(event.occurred_at);
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
    return error('INVALID_OCCURRED_AT', `Event at index ${index} requires a valid occurred_at timestamp.`);
  }

  if (!isObject(event.value) || !Number.isFinite(event.value.num)) {
    return error('INVALID_VALUE', `Event at index ${index} requires value.num as a number.`);
  }

  if (event.fields !== undefined && !isObject(event.fields)) {
    return error('INVALID_FIELDS', `Event at index ${index} fields must be an object.`);
  }

  if (event.cta !== undefined && event.cta !== null && !isObject(event.cta)) {
    return error('INVALID_CTA', `Event at index ${index} cta must be an object.`);
  }

  return {
    ok: true,
    event: {
      idempotency_key: cleanString(event.idempotency_key) || null,
      signal_key: signalKey,
      occurred_at: new Date(occurredAt).toISOString(),
      value: {
        num: event.value.num,
      },
      fields: event.fields || {},
      cta: event.cta || null,
    },
  };
}

export function normalizeIncomingPayload(payload) {
  if (!isObject(payload)) {
    return error('INVALID_PAYLOAD', 'Ingest payload must be a JSON object.');
  }

  const events = Array.isArray(payload.events) ? payload.events : [payload];
  if (events.length === 0) {
    return error('EMPTY_BATCH', 'Batch payload must include at least one event.');
  }

  if (events.length > MAX_BATCH_EVENTS) {
    return error('BATCH_TOO_LARGE', `Batch payload cannot contain more than ${MAX_BATCH_EVENTS} events.`);
  }

  const normalized = [];
  for (let index = 0; index < events.length; index += 1) {
    const result = validateIncomingEvent(events[index], index);
    if (!result.ok) return result;
    normalized.push(result.event);
  }

  return {
    ok: true,
    events: normalized,
  };
}
