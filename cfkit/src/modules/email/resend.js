function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalizeEmail(value));
}

function errorResult(code, message, details = {}) {
  return { success: false, error: { code, message, details } };
}

/**
 * Small Resend transport kept separate from the legacy messaging/MailerSend module.
 * Configure with Cloudflare secret `RESEND_API_KEY`.
 */
export class ResendEmailService {
  constructor(env, logger = null) {
    this.env = env || {};
    this.logger = logger || null;
    this.apiKey = normalizeText(this.env.RESEND_API_KEY);
    this.baseUrl = 'https://api.resend.com';
  }

  async sendEmail({
    from,
    to,
    subject,
    html,
    text = '',
    replyTo = '',
    tags = [],
  }) {
    const cleanFrom = normalizeText(from || this.env.RESEND_FROM_EMAIL || this.env.DEFAULT_FROM_EMAIL);
    const cleanTo = normalizeEmail(to);
    const cleanSubject = normalizeText(subject);
    const cleanHtml = normalizeText(html);

    if (!this.apiKey) return errorResult('CHANNEL_NOT_CONFIGURED', 'Resend API key is not configured');
    if (!isEmail(cleanTo)) return errorResult('INVALID_REQUEST', 'Recipient email is invalid');
    if (!cleanFrom) return errorResult('INVALID_REQUEST', 'Sender email is required');
    if (!cleanSubject) return errorResult('INVALID_REQUEST', 'Email subject is required');
    if (!cleanHtml) return errorResult('INVALID_REQUEST', 'Email HTML body is required');

    const body = {
      from: cleanFrom,
      to: [cleanTo],
      subject: cleanSubject,
      html: cleanHtml,
    };
    const cleanText = normalizeText(text);
    if (cleanText) body.text = cleanText;
    const cleanReplyTo = normalizeEmail(replyTo);
    if (cleanReplyTo) body.reply_to = cleanReplyTo;
    if (Array.isArray(tags) && tags.length) {
      body.tags = tags
        .map((tag) => ({
          name: normalizeText(tag?.name).slice(0, 256),
          value: normalizeText(tag?.value).slice(0, 256),
        }))
        .filter((tag) => tag.name && tag.value);
    }

    let res;
    let responseJson = null;
    let responseText = '';
    try {
      res = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      responseText = await res.text();
      try { responseJson = responseText ? JSON.parse(responseText) : null; } catch (_) { responseJson = null; }
    } catch (e) {
      try {
        this.logger?.warn?.('email.resend_network_error', { message: String(e?.message || e).slice(0, 300) });
      } catch (_) { /* ignore */ }
      return errorResult('NETWORK_ERROR', 'Resend request failed', { message: String(e?.message || e).slice(0, 400) });
    }

    const responseMeta = {
      provider: 'resend',
      http_status: Number(res?.status) || 0,
      ok: res?.ok === true,
      id: responseJson?.id || null,
      body_preview: responseText.slice(0, 500),
    };

    if (!res?.ok) {
      try {
        this.logger?.warn?.('email.resend_non_2xx', { status: responseMeta.http_status });
      } catch (_) { /* ignore */ }
      return errorResult(
        'PROVIDER_ERROR',
        responseJson?.message || responseJson?.error || 'Resend returned non-2xx',
        responseMeta,
      );
    }

    return {
      success: true,
      messageId: responseJson?.id || null,
      response_meta: responseMeta,
    };
  }
}
