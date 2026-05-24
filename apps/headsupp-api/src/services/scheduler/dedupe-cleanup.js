export function dedupeCleanupCutoff(now = new Date().toISOString(), retentionHours = 72) {
  return new Date(Date.parse(now) - Number(retentionHours) * 60 * 60 * 1000).toISOString();
}

export async function cleanupRawEventDedupe(db, { now = new Date().toISOString(), retentionHours = 72 } = {}) {
  const cutoff = dedupeCleanupCutoff(now, retentionHours);
  const result = await db
    .prepare('DELETE FROM raw_event_dedupe WHERE received_at < ?')
    .bind(cutoff)
    .run();

  return {
    cutoff,
    deleted: result?.meta?.changes ?? result?.changes ?? 0,
  };
}
