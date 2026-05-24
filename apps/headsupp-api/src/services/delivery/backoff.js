const BACKOFF_SECONDS = [0, 60, 300, 900, 3600, 21600];
const PERMANENT_FAILURE_CODES = new Set([400, 401, 403, 404]);

export function nextRetryAt(now, attemptCount) {
  const delay = BACKOFF_SECONDS[Math.min(attemptCount, BACKOFF_SECONDS.length - 1)];
  return new Date(Date.parse(now) + delay * 1000).toISOString();
}

export function classifyDeliveryResult({ responseStatus = null, error = null, previousAttemptCount = 0, now }) {
  const attemptCount = previousAttemptCount + 1;

  if (!error && responseStatus >= 200 && responseStatus < 300) {
    return {
      status: 'sent',
      attempt_count: attemptCount,
      last_attempt_at: now,
      next_retry_at: null,
      response_code: responseStatus,
    };
  }

  if (!error && PERMANENT_FAILURE_CODES.has(responseStatus)) {
    return {
      status: 'failed',
      attempt_count: attemptCount,
      last_attempt_at: now,
      next_retry_at: null,
      response_code: responseStatus,
    };
  }

  if (attemptCount >= BACKOFF_SECONDS.length) {
    return {
      status: 'failed',
      attempt_count: attemptCount,
      last_attempt_at: now,
      next_retry_at: null,
      response_code: responseStatus,
    };
  }

  return {
    status: 'retrying',
    attempt_count: attemptCount,
    last_attempt_at: now,
    next_retry_at: nextRetryAt(now, attemptCount),
    response_code: responseStatus,
  };
}
