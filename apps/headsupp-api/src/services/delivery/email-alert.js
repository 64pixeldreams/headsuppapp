import { classifyDeliveryResult, nextRetryAt } from './backoff.js';
import { renderAlertEmail } from '../email/render-alert-email.js';
import { sendEmail } from '../email/send-email.js';
import { buildEmailActionLinks } from '../subscribers/email-actions.js';
import { buildUnsubscribeUrl, createUnsubscribeToken } from '../subscribers/unsubscribe.js';

const PERMANENT_ERROR_CODES = new Set([
  'SEND_EMAIL_NOT_CONFIGURED',
  'INVALID_EMAIL_RECIPIENT',
  'INVALID_FROM_ADDRESS',
  'INVALID_RECIPIENT',
]);

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function logEmailEvent(level, event, details = {}) {
  const payload = {
    event,
    ...details,
  };
  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}

function classifyEmailResult({ error, previousAttemptCount = 0, now }) {
  if (!error) {
    return classifyDeliveryResult({
      responseStatus: 200,
      error: null,
      previousAttemptCount,
      now,
    });
  }
  const attemptCount = previousAttemptCount + 1;
  if (PERMANENT_ERROR_CODES.has(error.code) || error.retryable === false) {
    return {
      status: 'failed',
      attempt_count: attemptCount,
      last_attempt_at: now,
      next_retry_at: null,
      response_code: 400,
    };
  }
  if (attemptCount >= 6) {
    return {
      status: 'failed',
      attempt_count: attemptCount,
      last_attempt_at: now,
      next_retry_at: null,
      response_code: null,
    };
  }
  return {
    status: 'retrying',
    attempt_count: attemptCount,
    last_attempt_at: now,
    next_retry_at: nextRetryAt(now, attemptCount),
    response_code: null,
  };
}

export async function dispatchEmailAlertDelivery({
  db,
  delivery,
  alert,
  subscriber,
  channel,
  env = {},
  now = new Date().toISOString(),
  sendEmailFn = sendEmail,
}) {
  const config = parseJson(subscriber.config_json, {});
  const from = config.from || { email: env.HEADSUPP_EMAIL_FROM || 'alerts@headsupp.io', name: 'Heads Up' };
  const replyTo = config.reply_to || env.HEADSUPP_EMAIL_REPLY_TO || from.email;
  let rendered = null;
  try {
    const token = await createUnsubscribeToken({
      env,
      subscriberId: subscriber.id || subscriber.subscriber_id,
      channelId: subscriber.channel_id,
      mode: subscriber.mode,
      now,
    });
    const unsubscribeUrl = buildUnsubscribeUrl({ token, env });
    const actionLinks = await buildEmailActionLinks({
      env,
      subscriber,
      alert,
      delivery,
      now,
    });
    rendered = renderAlertEmail({
      alert,
      subscriber,
      channel,
      unsubscribe_url: unsubscribeUrl,
      action_links: actionLinks,
      defaults: {
        footer_text: env.HEADSUPP_EMAIL_FOOTER_TEXT,
        company_line: env.HEADSUPP_EMAIL_COMPANY_LINE,
      },
    });
  } catch (caught) {
    const state = classifyEmailResult({
      error: Object.assign(new Error(caught?.message || 'Email render failed'), {
        code: caught?.code || 'EMAIL_RENDER_ERROR',
        retryable: false,
      }),
      previousAttemptCount: delivery.attempt_count || 0,
      now,
    });
    await db
      .prepare(
        `UPDATE alert_deliveries
         SET status = ?, attempt_count = ?, last_attempt_at = ?, next_retry_at = ?,
             response_code = ?, response_body = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        state.status,
        state.attempt_count,
        state.last_attempt_at,
        state.next_retry_at,
        state.response_code,
        caught?.message || 'Email render failed',
        state.last_attempt_at,
        delivery.id,
      )
      .run();
    logEmailEvent('error', 'email_render_failed', {
      delivery_id: delivery.id,
      alert_id: alert.id,
      subscriber_id: subscriber.subscriber_id || subscriber.id,
      code: caught?.code || 'EMAIL_RENDER_ERROR',
      message: caught?.message || 'Email render failed',
    });
    return {
      ...state,
      template_id: null,
      error: caught?.message || 'Email render failed',
    };
  }

  let error = null;
  let responseBody = null;
  try {
    const result = await sendEmailFn({
      env,
      message: {
        from,
        to: [subscriber.destination_url],
        reply_to: { email: replyTo },
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      },
    });
    responseBody = JSON.stringify({
      ok: true,
      provider: result || null,
      template_id: rendered.template_id,
      action_ids: rendered.action_ids || [],
    });
    logEmailEvent('info', 'email_delivery_sent', {
      delivery_id: delivery.id,
      alert_id: alert.id,
      subscriber_id: subscriber.subscriber_id || subscriber.id,
      subscriber_type: subscriber.subscriber_type,
      severity: alert.severity,
      template_id: rendered.template_id,
    });
  } catch (caught) {
    error = caught;
    responseBody = caught?.message || 'Email send failed';
    logEmailEvent('error', 'email_delivery_failed', {
      delivery_id: delivery.id,
      alert_id: alert.id,
      subscriber_id: subscriber.subscriber_id || subscriber.id,
      subscriber_type: subscriber.subscriber_type,
      severity: alert.severity,
      template_id: rendered.template_id,
      code: caught?.code || 'EMAIL_SEND_ERROR',
      message: caught?.message || 'Email send failed',
    });
  }

  const state = classifyEmailResult({
    error,
    previousAttemptCount: delivery.attempt_count || 0,
    now,
  });

  await db
    .prepare(
      `UPDATE alert_deliveries
       SET status = ?, attempt_count = ?, last_attempt_at = ?, next_retry_at = ?,
           response_code = ?, response_body = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      state.status,
      state.attempt_count,
      state.last_attempt_at,
      state.next_retry_at,
      state.response_code,
      responseBody,
      state.last_attempt_at,
      delivery.id,
    )
    .run();

  return {
    ...state,
    template_id: rendered.template_id,
    error: error?.message || null,
  };
}
