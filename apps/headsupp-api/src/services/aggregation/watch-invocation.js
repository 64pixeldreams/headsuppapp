export async function getActiveWatchesForSignal(db, channelId, signalId) {
  const result = await db
    .prepare(
      `SELECT id, watch_id, signal_id
       FROM watches
       WHERE channel_id = ? AND signal_id = ? AND enabled = 1`,
    )
    .bind(channelId, signalId)
    .all();

  return result?.results || [];
}

export async function invokeWatchEvaluator(env, input) {
  if (!env.WATCH_EVALUATOR) {
    return {
      invoked: false,
      reason: 'WATCH_EVALUATOR_NOT_CONFIGURED',
    };
  }

  const id = env.WATCH_EVALUATOR.idFromName(input.watchId);
  const stub = env.WATCH_EVALUATOR.get(id);
  await stub.fetch('https://watch-evaluator.local/evaluate', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return {
    invoked: true,
    watchId: input.watchId,
  };
}

export async function invokeAffectedWatchEvaluators({ db, env, aggregateDeltas, now = new Date().toISOString() }) {
  const invocations = [];

  for (const delta of aggregateDeltas) {
    const watches = await getActiveWatchesForSignal(db, delta.channel_id, delta.signal_id);
    for (const watch of watches) {
      const watchId = watch.watch_id || watch.id;
      const result = await invokeWatchEvaluator(env, {
        watchId,
        reason: 'aggregate_updated',
        signalId: delta.signal_id,
        bucketType: delta.bucket_type,
        bucketStartAt: delta.bucket_start_at,
        now,
      });
      invocations.push(result);
    }
  }

  return invocations;
}
