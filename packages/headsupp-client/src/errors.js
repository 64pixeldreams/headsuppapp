export class HeadsUpApiError extends Error {
  constructor(message, { code = 'HEADSUPP_API_ERROR', status = null, response = null } = {}) {
    super(message);
    this.name = 'HeadsUpApiError';
    this.code = code;
    this.status = status;
    this.response = response;
  }
}

export function assertSuccess(envelope) {
  if (envelope?.success === true) return envelope.data;
  const error = envelope?.error || {};
  throw new HeadsUpApiError(error.message || 'Heads Up API request failed.', {
    code: error.code || 'HEADSUPP_API_ERROR',
    status: error.status || null,
    response: envelope,
  });
}

export function assertAccepted(envelope) {
  if (envelope?.accepted === true) return envelope;
  const error = envelope?.error || {};
  throw new HeadsUpApiError(error.message || 'Heads Up event was not accepted.', {
    code: error.code || 'HEADSUPP_INGEST_ERROR',
    status: error.status || null,
    response: envelope,
  });
}
