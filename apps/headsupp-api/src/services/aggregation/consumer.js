import { normalizeIncomingPayload } from '../ingest/event-validation.js';
import { normalizeEventByContract } from './contract-extraction.js';
import { beginRawEventProcessing, markRawEventProcessed } from './idempotency.js';
import { resolveSignalAndContract } from './signal-resolution.js';
import { eventToAggregateDeltas } from './buckets.js';
import { foldAggregateDeltas } from './fold-deltas.js';
import { upsertAggregateDeltas } from './aggregate-upsert.js';
import { invokeAffectedWatchEvaluators } from './watch-invocation.js';

export async function processRawEventMessages(messages, env, now = new Date().toISOString()) {
  const aggregateDeltas = [];
  let processed = 0;
  let duplicates = 0;
  const seenInBatch = new Set();
  const processingKeys = [];

  for (const message of messages) {
    const validation = normalizeIncomingPayload(message.event);
    if (!validation.ok) {
      throw new Error(`Invalid raw queue event: ${validation.code}`);
    }

    const normalizedMessage = {
      ...message,
      event: validation.events[0],
    };
    const idempotency = await beginRawEventProcessing(env.DB, normalizedMessage);
    if (seenInBatch.has(idempotency.idempotency_key)) {
      duplicates += 1;
      continue;
    }
    seenInBatch.add(idempotency.idempotency_key);
    if (idempotency.duplicate) {
      duplicates += 1;
      continue;
    }

    const { signal, contract } = await resolveSignalAndContract(env.DB, normalizedMessage, now);
    const normalizedByContract = normalizeEventByContract(normalizedMessage.event, contract);
    if (!normalizedByContract.ok) {
      throw new Error(`Invalid raw queue event: ${normalizedByContract.code}`);
    }
    aggregateDeltas.push(
      ...eventToAggregateDeltas({
        message: {
          ...normalizedMessage,
          event: normalizedByContract.event,
        },
        signal,
        contract,
        now,
      }),
    );
    processingKeys.push(idempotency.idempotency_key);
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
  for (const idempotencyKey of processingKeys) {
    await markRawEventProcessed(env.DB, idempotencyKey, now);
  }

  return {
    processed,
    duplicates,
    aggregate_deltas: foldedDeltas.length,
    watch_invocations: watchInvocations.filter((result) => result.invoked).length,
  };
}
