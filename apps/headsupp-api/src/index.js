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
import { writeAuditLog } from './services/audit/control-plane-audit.js';
import { buildEmailActionUrl, processEmailActionToken } from './services/subscribers/email-actions.js';
import { processEmailAuthorizationToken } from './services/subscribers/email-authorization.js';
import { processUnsubscribeToken } from './services/subscribers/unsubscribe.js';
import { processEmailTestReceipt, verifyEmailWorkerSignature } from './services/email/test-message-log.js';

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

function html(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;margin:40px;color:#111827;"><main style="max-width:560px;margin:0 auto;"><h1>${title}</h1>${body}</main></body></html>`;
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

async function readJsonBody(request) {
  const rawBody = await request.text();
  try {
    return { ok: true, rawBody, body: rawBody ? JSON.parse(rawBody) : {} };
  } catch {
    return { ok: false, rawBody, body: null };
  }
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

      if (url.pathname === '/internal/email/test-receipts' && request.method === 'POST') {
        if (!env.DB) {
          return json({ ok: false, error: { code: 'DB_NOT_CONFIGURED' } }, { status: 501 });
        }
        const parsed = await readJsonBody(request);
        if (!parsed.ok) {
          return json({ ok: false, error: { code: 'INVALID_JSON' } }, { status: 400 });
        }
        const verification = await verifyEmailWorkerSignature({
          secret: env.HEADSUPP_EMAIL_WORKER_WEBHOOK_SECRET,
          timestamp: request.headers.get('X-HeadsUp-Timestamp'),
          signature: request.headers.get('X-HeadsUp-Signature'),
          rawBody: parsed.rawBody,
        });
        if (!verification.ok) {
          return json({ ok: false, error: { code: verification.code } }, { status: verification.status });
        }
        const result = await processEmailTestReceipt({
          db: env.DB,
          receipt: parsed.body,
          now: new Date().toISOString(),
        });
        return json(result, { status: result.status || (result.ok ? 200 : 400) });
      }

      if (url.pathname === '/v1/subscribers/unsubscribe' && request.method === 'GET') {
        if (!env.DB) {
          return html('<h1>Heads Up</h1><p>Unsubscribe is unavailable right now.</p>', { status: 503 });
        }
        const token = url.searchParams.get('token');
        const result = await processUnsubscribeToken({
          db: env.DB,
          env,
          token,
          now: new Date().toISOString(),
        });
        await writeAuditLog({
          db: env.DB,
          action: 'subscriber.unsubscribe',
          auth: null,
          input: { token_present: Boolean(token), result: result.ok ? 'ok' : result.code },
          success: Boolean(result.ok),
          errorCode: result.ok ? null : result.code,
          targetType: 'subscriber',
          targetId: result.subscriber_id || null,
        });

        if (!result.ok) {
          return html('<h1>Heads Up</h1><p>This unsubscribe link is invalid or expired.</p>', { status: 200 });
        }
        return html('<h1>Heads Up</h1><p>You are unsubscribed. You will no longer receive these emails.</p>', { status: 200 });
      }

      if (url.pathname === '/v1/subscribers/email-action' && request.method === 'GET') {
        if (!env.DB) {
          return html(page('Heads Up', '<p>Email actions are unavailable right now.</p>'), { status: 503 });
        }
        const token = url.searchParams.get('token');
        const confirm = url.searchParams.get('confirm') === '1';
        const result = await processEmailActionToken({
          db: env.DB,
          env,
          token,
          confirm,
          now: new Date().toISOString(),
        });
        await writeAuditLog({
          db: env.DB,
          action: 'subscriber.emailAction',
          auth: null,
          input: {
            token_present: Boolean(token),
            confirm,
            result: result.ok ? result.code || 'ok' : result.code,
            workspace_id: result.workspace_id || result.payload?.ws || null,
          },
          success: Boolean(result.ok),
          errorCode: result.ok ? null : result.code,
          targetType: result.watch_id || result.payload?.watch ? 'watch' : 'subscriber',
          targetId: result.watch_id || result.payload?.watch || result.subscriber_id || result.payload?.sub || null,
        });

        if (!result.ok) {
          const message =
            result.code === 'EXPIRED_TOKEN'
              ? 'This email action link has expired. Use the latest alert email or open the app to change this watch.'
              : 'This email action link is invalid or can no longer be used.';
          return html(page('Heads Up', `<p>${message}</p>`), { status: 200 });
        }

        if (result.needs_confirmation) {
          const confirmUrl = buildEmailActionUrl({ token, env, confirm: true });
          return html(
            page(
              'Stop Watching?',
              `<p>This will stop this recipient from receiving future emails for this alert subscriber.</p><p><a href="${confirmUrl}" style="display:inline-block;background:#111827;color:#ffffff;padding:12px 16px;border-radius:8px;text-decoration:none;font-weight:700;">Confirm stop watching</a></p>`,
            ),
            { status: 200 },
          );
        }

        if (result.code === 'SNOOZED' || result.code === 'ALREADY_APPLIED') {
          const until = result.expires_at ? ` until ${result.expires_at}` : '';
          const prefix = result.code === 'ALREADY_APPLIED' ? 'This email action was already applied.' : `This watch is snoozed${until}.`;
          return html(page('Heads Up', `<p>${prefix}</p>`), { status: 200 });
        }

        if (result.code === 'STOPPED') {
          return html(page('Heads Up', '<p>You will no longer receive these email alerts.</p>'), { status: 200 });
        }

        return html(page('Heads Up', '<p>Email action complete.</p>'), { status: 200 });
      }

      if (url.pathname === '/v1/subscribers/confirm' && request.method === 'GET') {
        if (!env.DB) {
          return html(page('Heads Up', '<p>Email confirmation is unavailable right now.</p>'), { status: 503 });
        }
        const token = url.searchParams.get('token');
        const result = await processEmailAuthorizationToken({
          db: env.DB,
          env,
          token,
          now: new Date().toISOString(),
        });
        await writeAuditLog({
          db: env.DB,
          action: 'subscriber.confirmEmail',
          auth: null,
          input: {
            token_present: Boolean(token),
            result: result.ok ? result.code || 'ok' : result.code,
            workspace_id: result.workspace_id || null,
          },
          success: Boolean(result.ok),
          errorCode: result.ok ? null : result.code,
          targetType: 'subscriber',
          targetId: result.subscriber_id || null,
        });

        if (!result.ok) {
          const message =
            result.code === 'EXPIRED_TOKEN'
              ? 'This confirmation link has expired. Please request a new subscription confirmation.'
              : 'This confirmation link is invalid or can no longer be used.';
          return html(page('Heads Up', `<p>${message}</p>`), { status: 200 });
        }
        if (result.code === 'ALREADY_CONFIRMED') {
          return html(page('Heads Up', '<p>This email subscription is already confirmed.</p>'), { status: 200 });
        }
        return html(page('Heads Up', '<p>Your email subscription is confirmed. You will now receive these alerts.</p>'), { status: 200 });
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
            'Try /health, /api/v1/health, /api/v1/observability/overview, GET /v1/subscribers/unsubscribe, GET /v1/subscribers/email-action, GET /v1/subscribers/confirm, POST /api/function, or POST /v1/events/{connector_key}.',
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
