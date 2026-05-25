import { normalizeIncomingPayload } from '../ingest/event-validation.js';
import { normalizeEventByContract } from './contract-extraction.js';
import {
  beginRawEventProcessing,
  markRawEventAggregatedStatement,
  markRawEventProcessedStatement,
} from './idempotency.js';
import { resolveSignalAndContract } from './signal-resolution.js';
import { eventToAggregateDeltas } from './buckets.js';
import { foldAggregateDeltas } from './fold-deltas.js';
import { aggregateDeltaStatement } from './aggregate-upsert.js';
import { invokeAffectedWatchEvaluators } from './watch-invocation.js';

export async function processRawEventMessages(messages, env, now = new Date().toISOString()) {
  const aggregateDeltasToInvoke = [];
  let processed = 0;
  let duplicates = 0;
  const seenInBatch = new Set();
  const completionKeys = [];
  const aggregateApplyKeys = [];
  const pendingAggregateDeltas = [];
  const signalContractCache = new Map();

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

    const resolutionKey = `${normalizedMessage.channelId}:${normalizedMessage.event.signal_key}`;
    const cachedResolution = signalContractCache.get(resolutionKey);
    const resolution = cachedResolution || (await resolveSignalAndContract(env.DB, normalizedMessage, now));
    if (!cachedResolution) signalContractCache.set(resolutionKey, resolution);
    const { signal, contract } = resolution;
    const normalizedByContract = normalizeEventByContract(normalizedMessage.event, contract);
    if (!normalizedByContract.ok) {
      throw new Error(`Invalid raw queue event: ${normalizedByContract.code}`);
    }
    const deltas = eventToAggregateDeltas({
      message: {
        ...normalizedMessage,
        event: normalizedByContract.event,
      },
      signal,
      contract,
      now,
    });
    aggregateDeltasToInvoke.push(...deltas);
    if (!idempotency.aggregate_applied) {
      pendingAggregateDeltas.push(...deltas);
      aggregateApplyKeys.push(idempotency.idempotency_key);
    }
    completionKeys.push(idempotency.idempotency_key);
    processed += 1;
  }

  if (aggregateApplyKeys.length > 0) {
    const foldedAggregateWrites = foldAggregateDeltas(pendingAggregateDeltas);
    await env.DB.batch([
      ...foldedAggregateWrites.map((delta) => aggregateDeltaStatement(env.DB, delta)),
      ...aggregateApplyKeys.map((idempotencyKey) => markRawEventAggregatedStatement(env.DB, idempotencyKey, now)),
    ]);
  }

  const foldedDeltas = foldAggregateDeltas(aggregateDeltasToInvoke);
  const watchInvocations = await invokeAffectedWatchEvaluators({
    db: env.DB,
    env,
    aggregateDeltas: foldedDeltas,
    now,
  });
  if (completionKeys.length > 0) {
    await env.DB.batch(completionKeys.map((idempotencyKey) => markRawEventProcessedStatement(env.DB, idempotencyKey, now)));
  }

  return {
    processed,
    duplicates,
    aggregate_deltas: foldedDeltas.length,
    watch_invocations: watchInvocations.filter((result) => result.invoked).length,
  };
}
