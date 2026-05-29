import { normalizeIncomingPayload } from '../ingest/event-validation.js';
import { normalizeEventByContract } from './contract-extraction.js';
import {
  beginRawEventProcessing,
  markRawEventAggregatedStatement,
  markRawEventFailedStatement,
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
  let failed = 0;
  const seenInBatch = new Set();
  const completionKeys = [];
  const failedKeys = [];
  const aggregateApplyKeys = [];
  const pendingAggregateDeltas = [];
  const signalContractCache = new Map();

  for (const message of messages) {
    let idempotencyKey = null;
    try {
      const validation = normalizeIncomingPayload(message.event);
      if (!validation.ok) {
        // Already validated at ingest; treat as terminal rather than poisoning the batch.
        failed += 1;
        continue;
      }

      const normalizedMessage = {
        ...message,
        event: validation.events[0],
      };
      const idempotency = await beginRawEventProcessing(env.DB, normalizedMessage);
      idempotencyKey = idempotency.idempotency_key;
      if (seenInBatch.has(idempotencyKey)) {
        duplicates += 1;
        continue;
      }
      seenInBatch.add(idempotencyKey);
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
        // Unprocessable event (e.g. no valid timestamp). Mark terminal so it can
        // neither strand the batch nor retry forever.
        failedKeys.push(idempotencyKey);
        failed += 1;
        continue;
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

      const writeDeltas = deltas.filter((delta) => delta.aggregate !== false);
      if (writeDeltas.length > 0 && !idempotency.aggregate_applied) {
        pendingAggregateDeltas.push(...writeDeltas);
        aggregateApplyKeys.push(idempotencyKey);
      }
      completionKeys.push(idempotencyKey);
      processed += 1;
    } catch (error) {
      // A single bad event must never throw out of the batch: that strands every
      // event in the batch in 'processing' and produces zero alerts. Mark the
      // offending event terminal and continue.
      if (idempotencyKey) failedKeys.push(idempotencyKey);
      failed += 1;
    }
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

  const completionStatements = [
    ...completionKeys.map((idempotencyKey) => markRawEventProcessedStatement(env.DB, idempotencyKey, now)),
    ...failedKeys.map((idempotencyKey) => markRawEventFailedStatement(env.DB, idempotencyKey, now)),
  ];
  if (completionStatements.length > 0) {
    await env.DB.batch(completionStatements);
  }

  return {
    processed,
    duplicates,
    failed,
    aggregate_deltas: foldedDeltas.length,
    watch_invocations: watchInvocations.filter((result) => result.invoked).length,
  };
}
