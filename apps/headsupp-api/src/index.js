import { CloudFunction } from '../../../cfkit/src/modules/cloudfunction/index.js';
import { LOGS } from '../../../cfkit/src/modules/logs/index.js';
import { createKVControlPlaneStore } from './services/control-plane/kv-store.js';
import { verifyConnectorHmac } from './services/connectors/hmac.js';
import { registerHeadsuppFunctions } from './functions/register-headsupp-functions.js';
import { processRawEventMessages } from './services/aggregation/consumer.js';
import { processAggregateDeliveryMessage } from './services/delivery/aggregate-delivery-consumer.js';
import { processAlertDeliveryMessage } from './services/delivery/alert-delivery-consumer.js';
import { normalizeIncomingPayload } from './services/ingest/event-validation.js';
import { createRawEventMessages, sendRawEventMessages } from './services/ingest/raw-event-queue.js';
import { getObservabilityOverview } from './services/observability/overview.js';
import { runScheduledTasks } from './services/scheduler/scheduled-tasks.js';

export { WatchEvaluatorDO } from './durable/WatchEvaluatorDO.js';

let cloudFunction = null;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-HeadsUp-Timestamp, X-HeadsUp-Signature',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function extractBearerToken(request) {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

function isAuthorizedObservabilityRequest(request, env) {
  const provided =
    extractBearerToken(request) || request.headers.get('X-HeadsUp-Operator-Token') || request.headers.get('X-HeadsUp-Bootstrap-Token');
  if (!provided) return false;
  const expected = [env.HEADSUPP_OPERATOR_TOKEN, env.HEADSUPP_BOOTSTRAP_TOKEN].filter(Boolean);
  return expected.includes(provided);
}

async function getCloudFunction(env) {
  if (cloudFunction) return cloudFunction;
  cloudFunction = new CloudFunction(env);
  await registerHeadsuppFunctions(cloudFunction);
  return cloudFunction;
}

function healthPayload() {
  return {
    status: 'ok',
    app: 'headsupp_app',
    framework: 'CFKit',
    role: 'attention-processing-api',
    timestamp: new Date().toISOString(),
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return corsPreflight();
    }

    LOGS.setRequest({
      requestId: crypto.randomUUID(),
      method: request.method,
      url: request.url,
    });

    const logger = LOGS.init('HEADSUPP.api');

    try {
      const url = new URL(request.url);

      if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/v1/health')) {
        return json(healthPayload());
      }

      if (url.pathname === '/api/function' && request.method === 'POST') {
        const cf = await getCloudFunction(env);
        const body = await request.json();
        const { action, payload } = body || {};

        if (!action) {
          return json(
            {
              success: false,
              error: {
                code: 'MISSING_ACTION',
                message: 'Action is required',
              },
            },
            { status: 400 },
          );
        }

        const response = await cf.execute(action, payload || {}, request, ctx);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            ...Object.fromEntries(response.headers.entries()),
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      if (url.pathname === '/api/v1/observability/overview' && request.method === 'GET') {
        if (!isAuthorizedObservabilityRequest(request, env)) {
          return json(
            {
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Operator authentication is required.',
              },
            },
            { status: 401 },
          );
        }
        if (!env.DB) {
          return json(
            {
              success: false,
              error: {
                code: 'DB_NOT_CONFIGURED',
                message: 'DB binding is required for observability.',
              },
            },
            { status: 501 },
          );
        }
        return json({
          success: true,
          data: await getObservabilityOverview(env.DB),
        });
      }

      if (url.pathname.startsWith('/v1/events/')) {
        if (request.method !== 'POST') {
          return json(
            {
              accepted: false,
              error: {
                code: 'METHOD_NOT_ALLOWED',
                message: 'Event ingest requires POST.',
              },
            },
            { status: 405 },
          );
        }

        if (!env.HEADSUPP_CACHE) {
          return json(
            {
              accepted: false,
              error: {
                code: 'INGEST_STORE_NOT_CONFIGURED',
                message: 'HEADSUPP_CACHE is required for connector authentication.',
              },
            },
            { status: 501 },
          );
        }

        const connectorKey = decodeURIComponent(url.pathname.slice('/v1/events/'.length));
        const rawBody = await request.text();
        let payload = null;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return json(
            {
              accepted: false,
              error: {
                code: 'INVALID_JSON',
                message: 'Request body must be valid JSON.',
              },
            },
            { status: 400 },
          );
        }

        const store = createKVControlPlaneStore(env.HEADSUPP_CACHE);
        const connector = await store.get('connector_by_key', connectorKey);
        const verification = await verifyConnectorHmac({
          connector,
          timestamp: request.headers.get('X-HeadsUp-Timestamp'),
          signature: request.headers.get('X-HeadsUp-Signature'),
          rawBody,
        });

        if (!verification.ok) {
          return json(
            {
              accepted: false,
              error: {
                code: verification.code,
                message: verification.message,
              },
            },
            { status: verification.status },
          );
        }

        const normalized = normalizeIncomingPayload(payload);
        if (!normalized.ok) {
          return json(
            {
              accepted: false,
              error: {
                code: normalized.code,
                message: normalized.message,
              },
            },
            { status: normalized.status },
          );
        }

        const messages = createRawEventMessages({
          connector: verification.connector,
          events: normalized.events,
          receivedAt: new Date().toISOString(),
        });
        const queue = await sendRawEventMessages(env.RAW_EVENTS_QUEUE, messages);
        if (!queue.ok) {
          return json(
            {
              accepted: false,
              error: {
                code: queue.code,
                message: queue.message,
              },
            },
            { status: queue.status },
          );
        }

        return json(
          {
            accepted: true,
            authenticated: true,
            queued: queue.queued,
            rejected: 0,
            connector_key: connectorKey,
          },
          { status: 202 },
        );
      }

      return json(
        {
          error: 'Not Found',
          message:
            'Try /health, /api/v1/health, /api/v1/observability/overview, POST /api/function, or POST /v1/events/{connector_key}.',
        },
        { status: 404 },
      );
    } catch (error) {
      logger.error('Unhandled worker error', error);
      return json(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error?.message || 'Unexpected error',
          },
        },
        { status: 500 },
      );
    }
  },

  async queue(batch, env) {
    const messages = batch.messages.map((message) => message.body);
    const alertDeliveryMessages = messages.filter((message) => message.alertDeliveryId || message.deliveryId);
    const aggregateDeliveryMessages = messages.filter((message) => message.aggregateDeliveryId);
    const rawMessages = messages.filter(
      (message) => !message.alertDeliveryId && !message.deliveryId && !message.aggregateDeliveryId,
    );

    if (rawMessages.length > 0) {
      await processRawEventMessages(rawMessages, env);
    }

    for (const message of alertDeliveryMessages) {
      await processAlertDeliveryMessage(message, env);
    }

    for (const message of aggregateDeliveryMessages) {
      await processAggregateDeliveryMessage(message, env);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledTasks(env, event));
  },
};
