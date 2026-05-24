import { normalizeIncomingPayload } from '../ingest/event-validation.js';
import { applyRawEventIdempotency } from './idempotency.js';
import { resolveSignalAndContract } from './signal-resolution.js';
import { eventToAggregateDeltas } from './buckets.js';
import { foldAggregateDeltas } from './fold-deltas.js';
import { upsertAggregateDeltas } from './aggregate-upsert.js';
import { invokeAffectedWatchEvaluators } from './watch-invocation.js';

export async function processRawEventMessages(messages, env, now = new Date().toISOString()) {
  const aggregateDeltas = [];
  let processed = 0;
  let duplicates = 0;

  for (const message of messages) {
    const validation = normalizeIncomingPayload(message.event);
    if (!validation.ok) {
      throw new Error(`Invalid raw queue event: ${validation.code}`);
    }

    const normalizedMessage = {
      ...message,
      event: validation.events[0],
    };
    const idempotency = await applyRawEventIdempotency(env.DB, normalizedMessage);
    if (idempotency.duplicate) {
      duplicates += 1;
      continue;
    }

    const { signal, contract } = await resolveSignalAndContract(env.DB, normalizedMessage, now);
    aggregateDeltas.push(
      ...eventToAggregateDeltas({
        message: normalizedMessage,
        signal,
        contract,
        now,
      }),
    );
    processed += 1;
  }

  const foldedDeltas = foldAggregateDeltas(aggregateDeltas);
  await upsertAggregateDeltas(env.DB, foldedDeltas);
  const watchInvocations = await invokeAffectedWatchEvaluators({
    db: env.DB,
    env,
    aggregateDeltas: foldedDeltas,
    now,
  });

  return {
    processed,
    duplicates,
    aggregate_deltas: foldedDeltas.length,
    watch_invocations: watchInvocations.filter((result) => result.invoked).length,
  };
}
