import { signConnectorPayload } from '../../src/services/connectors/hmac.js';

export async function checkHealth(baseUrl) {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();
  if (!response.ok || body.status !== 'ok') {
    throw new Error(`Health check failed: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function sendSignedEvents({ baseUrl, connectorKey, connectorSecret, events }) {
  const rawBody = JSON.stringify({ events });
  const timestamp = new Date().toISOString();
  const signature = await signConnectorPayload({ secret: connectorSecret, timestamp, rawBody });
  const response = await fetch(`${baseUrl}/v1/events/${connectorKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HeadsUp-Timestamp': timestamp,
      'X-HeadsUp-Signature': signature,
    },
    body: rawBody,
  });
  const body = await response.json();
  if (response.status !== 202 || !body.accepted) {
    throw new Error(`Ingest failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export function buildMetricEvent({ runId, name, signalKey, value, occurredAt = new Date().toISOString(), source }) {
  return {
    idempotency_key: `generic-smoke:${runId}:${name}`,
    signal_key: signalKey,
    occurred_at: occurredAt,
    value: { num: value },
    fields: { source },
  };
}

export function buildMetricEvents({ runId, count, signalKey, value, source, prefix = 'normal', startAt = Date.now() - 60_000 }) {
  return Array.from({ length: count }, (_, index) =>
    buildMetricEvent({
      runId,
      name: `${prefix}:${index}`,
      signalKey,
      value,
      source,
      occurredAt: new Date(startAt + index * 1000).toISOString(),
    }),
  );
}
