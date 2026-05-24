function safeErrorMessage(error) {
  const message = String(error?.message || error || '').slice(0, 300);
  return message.replace(/https:\/\/hooks\.slack\.com\/services\/\S+/g, 'https://hooks.slack.com/services/[redacted]');
}

export function buildOperationalStatusRow({
  key,
  status,
  metadata = {},
  error = null,
  now = new Date().toISOString(),
}) {
  return {
    key,
    status,
    last_success_at: status === 'ok' ? now : null,
    last_failure_at: status === 'error' ? now : null,
    last_error_code: error?.code || null,
    last_error_message: error ? safeErrorMessage(error) : null,
    metadata_json: JSON.stringify(metadata || {}),
    updated_at: now,
  };
}

export async function recordOperationalStatus({ db, key, status, metadata = {}, error = null, now }) {
  if (!db) return null;
  const row = buildOperationalStatusRow({ key, status, metadata, error, now });
  await db
    .prepare(
      `INSERT INTO operational_status (
        key, status, last_success_at, last_failure_at, last_error_code, last_error_message, metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        status = excluded.status,
        last_success_at = COALESCE(excluded.last_success_at, operational_status.last_success_at),
        last_failure_at = COALESCE(excluded.last_failure_at, operational_status.last_failure_at),
        last_error_code = excluded.last_error_code,
        last_error_message = excluded.last_error_message,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
    )
    .bind(
      row.key,
      row.status,
      row.last_success_at,
      row.last_failure_at,
      row.last_error_code,
      row.last_error_message,
      row.metadata_json,
      row.updated_at,
    )
    .run();
  return row;
}

export async function loadOperationalStatus(db, key) {
  try {
    return await db.prepare('SELECT * FROM operational_status WHERE key = ? LIMIT 1').bind(key).first();
  } catch {
    return null;
  }
}
