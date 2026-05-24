const MAX_QUEUE_BATCH_SIZE = 100;

export function chunkMessages(messages, size = MAX_QUEUE_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < messages.length; index += size) {
    chunks.push(messages.slice(index, index + size));
  }
  return chunks;
}

export function createRawEventMessages({ connector, events, receivedAt }) {
  return events.map((event) => ({
    workspaceId: connector.workspace_id,
    channelId: connector.channel_id,
    connectorId: connector.connector_id,
    connectorKey: connector.connector_key,
    receivedAt,
    event,
  }));
}

export async function sendRawEventMessages(queue, messages) {
  if (!queue?.sendBatch) {
    return {
      ok: false,
      status: 501,
      code: 'RAW_EVENTS_QUEUE_NOT_CONFIGURED',
      message: 'RAW_EVENTS_QUEUE is required for event ingest.',
    };
  }

  for (const chunk of chunkMessages(messages)) {
    await queue.sendBatch(chunk.map((message) => ({ body: message })));
  }

  return {
    ok: true,
    queued: messages.length,
  };
}
