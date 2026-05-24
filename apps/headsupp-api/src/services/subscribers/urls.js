export function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
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

export function validateSubscriberUrl(type, destinationUrl) {
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
  };
}
