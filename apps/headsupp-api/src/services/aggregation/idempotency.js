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

export async function applyRawEventIdempotency(db, message, receivedAt = message.receivedAt) {
  const idempotencyKey = await rawEventIdempotencyKey(message);
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO raw_event_dedupe (
        idempotency_key,
        workspace_id,
        channel_id,
        signal_key,
        received_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(idempotencyKey, message.workspaceId, message.channelId, message.event.signal_key, receivedAt)
    .run();

  const changes = result?.meta?.changes ?? result?.changes ?? 0;
  return {
    ok: true,
    idempotency_key: idempotencyKey,
    duplicate: changes === 0,
  };
}
