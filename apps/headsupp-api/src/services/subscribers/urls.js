export function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmailAddress(value) {
  const email = normalizeEmailAddress(value);
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isSlackWebhookUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'hooks.slack.com' && url.pathname.startsWith('/services/');
  } catch {
    return false;
  }
}

export function redactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.split('/').slice(0, 3).join('/')}/...`;
  } catch {
    return null;
  }
}

export function redactEmailAddress(value) {
  const email = normalizeEmailAddress(value);
  const [local, domain] = email.split('@');
  if (!local || !domain) return null;
  const prefix = local.length <= 2 ? `${local[0] || ''}*` : `${local.slice(0, 2)}***`;
  return `${prefix}@${domain}`;
}

export function redactSubscriberDestination(type, destinationUrl) {
  if (type === 'email') return redactEmailAddress(destinationUrl);
  return redactUrl(destinationUrl);
}

function parseSubscriberConfig(config) {
  if (!config) return {};
  if (typeof config === 'object') return config;
  try {
    return JSON.parse(config);
  } catch {
    return {};
  }
}

export function resolveSubscriberRecipients({ destinationUrl, config = {} }) {
  const parsed = parseSubscriberConfig(config);
  const to = Array.isArray(parsed.to) ? parsed.to : [];
  const normalizedList = to.map(normalizeEmailAddress).filter(Boolean);
  const primary = normalizeEmailAddress(destinationUrl);
  if (primary) normalizedList.unshift(primary);
  return [...new Set(normalizedList)];
}

export function validateSubscriberUrl(type, destinationUrl, config = {}) {
  if (type === 'email') {
    const recipients = resolveSubscriberRecipients({ destinationUrl, config });
    if (recipients.length === 0) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_EMAIL_RECIPIENT',
        message: 'Email subscribers require destination_url or config.to with at least one valid email address.',
      };
    }

    const invalid = recipients.find((email) => !isValidEmailAddress(email));
    if (invalid) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_EMAIL_RECIPIENT',
        message: `Invalid email recipient: ${invalid}.`,
      };
    }

    return {
      ok: true,
      normalized_destination: recipients[0],
      recipients,
    };
  }

  if (!isHttpsUrl(destinationUrl)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_DESTINATION_URL',
      message: 'Subscriber destination_url must be a valid https URL.',
    };
  }

  if (type === 'slack_webhook' && !isSlackWebhookUrl(destinationUrl)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SLACK_WEBHOOK_URL',
      message: 'Slack subscribers require a Slack incoming webhook URL.',
    };
  }

  return {
    ok: true,
    normalized_destination: String(destinationUrl || ''),
  };
}
