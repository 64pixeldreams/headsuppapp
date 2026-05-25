function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(digest);
}

export async function rawEventIdempotencyKey(message) {
  if (message.event.idempotency_key) return message.event.idempotency_key;

  const hash = await sha256Hex(JSON.stringify(message.event));
  return `${message.connectorId}:${message.event.signal_key}:${message.event.occurred_at}:${hash}`;
}

export async function beginRawEventProcessing(db, message, receivedAt = message.receivedAt) {
  const idempotencyKey = await rawEventIdempotencyKey(message);
  const insertResult = await db
    .prepare(
      `INSERT OR IGNORE INTO raw_event_dedupe (
        idempotency_key,
        workspace_id,
        channel_id,
        signal_key,
        received_at,
        status,
        processing_started_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
    )
    .bind(idempotencyKey, message.workspaceId, message.channelId, message.event.signal_key, receivedAt, receivedAt, receivedAt)
    .run();
  const inserted = Number(insertResult?.meta?.changes || 0) > 0;

  const state = await db
    .prepare('SELECT processed_at, aggregate_applied_at, status FROM raw_event_dedupe WHERE idempotency_key = ? LIMIT 1')
    .bind(idempotencyKey)
    .first();
  if (inserted && state && !state.processed_at) {
    await db
      .prepare(
        `UPDATE raw_event_dedupe
         SET status = 'processing', processing_started_at = ?, updated_at = ?
         WHERE idempotency_key = ? AND processed_at IS NULL`,
      )
      .bind(receivedAt, receivedAt, idempotencyKey)
      .run();
  }
  return {
    ok: true,
    idempotency_key: idempotencyKey,
    duplicate: Boolean(state?.processed_at) || (!inserted && !state?.aggregate_applied_at),
    status: state?.status || 'processing',
    aggregate_applied: Boolean(state?.aggregate_applied_at),
    inserted,
  };
}

export function markRawEventAggregatedStatement(db, idempotencyKey, now = new Date().toISOString()) {
  return db
    .prepare(
      `UPDATE raw_event_dedupe
       SET aggregate_applied_at = COALESCE(aggregate_applied_at, ?), updated_at = ?
       WHERE idempotency_key = ?`,
    )
    .bind(now, now, idempotencyKey);
}

export async function markRawEventAggregated(db, idempotencyKey, now = new Date().toISOString()) {
  await markRawEventAggregatedStatement(db, idempotencyKey, now).run();

  return {
    ok: true,
    idempotency_key: idempotencyKey,
  };
}

export async function markRawEventProcessed(db, idempotencyKey, now = new Date().toISOString()) {
  await markRawEventProcessedStatement(db, idempotencyKey, now).run();

  return {
    ok: true,
    idempotency_key: idempotencyKey,
  };
}

export function markRawEventProcessedStatement(db, idempotencyKey, now = new Date().toISOString()) {
  return db
    .prepare(
      `UPDATE raw_event_dedupe
       SET status = 'processed', aggregate_applied_at = COALESCE(aggregate_applied_at, ?), processed_at = ?, updated_at = ?
       WHERE idempotency_key = ?`,
    )
    .bind(now, now, now, idempotencyKey);
}
