export const DEFAULT_ACCOUNT_ID = '55987b6602e8ac9db46e14dcc7ad2c79';
export const DEFAULT_D1_DATABASE_ID = '715838d2-00c0-436f-a878-3a079f9e49f2';
export const DEFAULT_KV_NAMESPACE_ID = '32193cc252084002bedf07caa8c5996c';
export const DEFAULT_BASE_URL = 'https://headsupp_app.martin-598.workers.dev';

export function requireEnv(name, value) {
  if (!String(value || '').trim()) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function redactSlackUrl(url) {
  return String(url || '').replace(/(https:\/\/hooks\.slack\.com\/services\/[^/]+\/).+/, '$1...');
}

export function redactUrl(url) {
  const value = String(url || '');
  if (value.startsWith('https://hooks.slack.com/services/')) return redactSlackUrl(value);
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
    return `${parsed.origin}${path ? `/${path}` : ''}/...`;
  } catch {
    return null;
  }
}

export function redactSecret(value) {
  if (!value) return value;
  const text = String(value);
  if (text.length <= 8) return '...';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function smokeRuntime(env = process.env) {
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID,
    databaseId: env.HEADSUPP_SMOKE_D1_DATABASE_ID || DEFAULT_D1_DATABASE_ID,
    kvNamespaceId: env.HEADSUPP_SMOKE_KV_NAMESPACE_ID || DEFAULT_KV_NAMESPACE_ID,
    baseUrl: (env.HEADSUPP_SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    apiToken: env.CLOUDFLARE_API_TOKEN,
    slackWebhookUrl: env.HEADSUPP_SMOKE_SLACK_WEBHOOK_URL,
    serviceApiKey: env.HEADSUPP_SMOKE_SERVICE_API_KEY || env.HEADSUPP_API_KEY,
    bootstrapToken: String(env.HEADSUPP_BOOTSTRAP_TOKEN || '').trim() || null,
    operatorToken: String(env.HEADSUPP_OPERATOR_TOKEN || '').trim() || null,
  };
}
