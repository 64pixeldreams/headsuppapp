import { classifyDeliveryResult } from './backoff.js';

export async function updateAggregateDeliveryState(db, deliveryId, state, responseBody = null) {
  await db
    .prepare(
      `UPDATE aggregate_deliveries
       SET status = ?, attempt_count = ?, last_attempt_at = ?, next_retry_at = ?,
           response_code = ?, response_body = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      state.status,
      state.attempt_count,
      state.last_attempt_at,
      state.next_retry_at,
      state.response_code,
      responseBody,
      state.last_attempt_at,
      deliveryId,
    )
    .run();
}

export async function dispatchAggregateDelivery({
  db,
  delivery,
  subscriber,
  fetchFn = fetch,
  now = new Date().toISOString(),
}) {
  let responseStatus = null;
  let responseBody = null;
  let error = null;
  try {
    const response = await fetchFn(subscriber.destination_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: delivery.payload_json,
    });
    responseStatus = response.status;
    responseBody = await response.text();
  } catch (caught) {
    error = caught;
    responseBody = caught?.message || 'Network error';
  }

  const state = classifyDeliveryResult({
    responseStatus,
    error,
    previousAttemptCount: delivery.attempt_count || 0,
    now,
  });
  await updateAggregateDeliveryState(db, delivery.id, state, responseBody);
  return { ...state, error: error?.message || null };
}
