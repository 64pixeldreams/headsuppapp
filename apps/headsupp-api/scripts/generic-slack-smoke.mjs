import { signConnectorPayload } from '../src/services/connectors/hmac.js';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '55987b6602e8ac9db46e14dcc7ad2c79';
const DATABASE_ID = process.env.HEADSUPP_SMOKE_D1_DATABASE_ID || '715838d2-00c0-436f-a878-3a079f9e49f2';
const KV_NAMESPACE_ID = process.env.HEADSUPP_SMOKE_KV_NAMESPACE_ID || '32193cc252084002bedf07caa8c5996c';
const BASE_URL = (process.env.HEADSUPP_SMOKE_BASE_URL || 'https://headsupp_app.martin-598.workers.dev').replace(
  /\/$/,
  '',
);
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const SLACK_WEBHOOK_URL = process.env.HEADSUPP_SMOKE_SLACK_WEBHOOK_URL;

const ids = Object.freeze({
  workspace: 'smoke_generic_workspace',
  channel: 'smoke_generic_channel',
  connector: 'smoke_generic_connector',
  connectorKey: 'ck_smoke_generic_slack',
  signal: 'smoke_generic_signal',
  signalContract: 'smoke_generic_signal_contract',
  watch: 'smoke_generic_watch_high',
  subscriber: 'smoke_generic_slack_subscriber',
});
const connectorSecret = 'generic-smoke-secret-not-production';
const signalKey = 'demo.metric';

function requireRuntimeInputs() {
  const missing = [];
  if (!API_TOKEN) missing.push('CLOUDFLARE_API_TOKEN');
  if (!SLACK_WEBHOOK_URL) missing.push('HEADSUPP_SMOKE_SLACK_WEBHOOK_URL');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

function redactSlackUrl(url) {
  return String(url || '').replace(/(https:\/\/hooks\.slack\.com\/services\/[^/]+\/).+/, '$1...');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API failed ${response.status}: ${text}`);
  }
  return body.result;
}

async function d1Query(sql, params = []) {
  const result = await cloudflare(`/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params }),
  });
  return Array.isArray(result) ? result[0] : result;
}

async function d1First(sql, params = []) {
  const result = await d1Query(sql, params);
  return result?.results?.[0] || null;
}

async function putKvJson(key, value) {
  await cloudflare(
    `/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    },
  );
}

async function cleanupSmokeRows() {
  const statements = [
    ['DELETE FROM alert_deliveries WHERE alert_id IN (SELECT id FROM alerts WHERE channel_id = ?)', [ids.channel]],
    ['DELETE FROM alerts WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watch_states WHERE watch_id = ?', [ids.watch]],
    ['DELETE FROM raw_event_dedupe WHERE idempotency_key LIKE ?', ['generic-smoke:%']],
    ['DELETE FROM aggregate_deliveries WHERE signal_id = ?', [ids.signal]],
    ['DELETE FROM aggregates WHERE signal_id = ?', [ids.signal]],
    ['DELETE FROM subscribers WHERE id = ?', [ids.subscriber]],
    ['DELETE FROM watches WHERE id = ?', [ids.watch]],
    ['DELETE FROM signal_contracts WHERE signal_id = ?', [ids.signal]],
    ['DELETE FROM signals WHERE id = ?', [ids.signal]],
    ['DELETE FROM connectors WHERE id = ?', [ids.connector]],
    ['DELETE FROM channels WHERE id = ?', [ids.channel]],
    ['DELETE FROM workspaces WHERE id = ?', [ids.workspace]],
  ];

  for (const [sql, params] of statements) {
    await d1Query(sql, params);
  }
}

async function seedSmokeRows() {
  const now = new Date().toISOString();
  await d1Query(
    `INSERT INTO workspaces (
      id, workspace_id, workspace_key, name, source_app, external_tenant_id, external_user_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.workspace,
      ids.workspace,
      'headsupp:generic-slack-smoke',
      'Generic Slack Smoke Workspace',
      'headsupp-smoke',
      'generic-smoke',
      'generic-smoke-user',
      'active',
      now,
      now,
    ],
  );
  await d1Query(
    `INSERT INTO channels (
      id, channel_id, workspace_id, name, channel_key, purpose, status, source_app,
      external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.channel,
      ids.channel,
      ids.workspace,
      'Generic Slack Smoke Channel',
      'headsupp:generic-slack-smoke:channel',
      'Core smoke test channel',
      'active',
      'headsupp-smoke',
      'generic-smoke',
      'generic-smoke-user',
      'generic-smoke-resource',
      now,
      now,
    ],
  );
  await d1Query(
    `INSERT INTO connectors (
      id, connector_id, workspace_id, channel_id, connector_type, connector_key, secret_hash,
      connector_secret, config_json, status, enabled, source_app, external_tenant_id,
      external_user_id, external_resource_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.connector,
      ids.connector,
      ids.workspace,
      ids.channel,
      'webhook',
      ids.connectorKey,
      null,
      connectorSecret,
      '{}',
      'active',
      1,
      'headsupp-smoke',
      'generic-smoke',
      'generic-smoke-user',
      'generic-smoke-resource',
      now,
      now,
    ],
  );
  await d1Query(
    `INSERT INTO subscribers (
      id, subscriber_id, workspace_id, channel_id, subscriber_type, name, destination_url,
      destination_url_redacted, secret_hash, mode, config_json, enabled, source_app,
      external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.subscriber,
      ids.subscriber,
      ids.workspace,
      ids.channel,
      'slack_webhook',
      'Generic smoke Slack alerts',
      SLACK_WEBHOOK_URL,
      redactSlackUrl(SLACK_WEBHOOK_URL),
      null,
      'alert',
      '{}',
      1,
      'headsupp-smoke',
      'generic-smoke',
      'generic-smoke-user',
      'generic-smoke-resource',
      now,
      now,
    ],
  );
  await d1Query(
    `INSERT INTO signals (
      id, signal_id, workspace_id, channel_id, signal_key, signal_type, value_mode, unit, description, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.signal,
      ids.signal,
      ids.workspace,
      ids.channel,
      signalKey,
      'metric',
      'last',
      null,
      'Generic Slack smoke metric',
      'active',
      now,
      now,
    ],
  );
  await d1Query(
    `INSERT INTO signal_contracts (
      id, signal_contract_id, signal_id, contract_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      ids.signalContract,
      ids.signalContract,
      ids.signal,
      JSON.stringify({ dimensions: ['source'], default_bucket_types: ['minute'], default_aggregate: 'last' }),
      now,
      now,
    ],
  );
  await d1Query(
    `INSERT INTO watches (
      id, watch_id, workspace_id, channel_id, signal_id, name, watch_type, config_json,
      cooldown_seconds, escalation_json, recovery_json, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.watch,
      ids.watch,
      ids.workspace,
      ids.channel,
      ids.signal,
      'Generic smoke metric high',
      'LAST_VALUE_GT',
      JSON.stringify({ threshold: 10, severity: 'warning', bucket_type: 'minute' }),
      60,
      null,
      null,
      1,
      now,
      now,
    ],
  );

  await putKvJson(`control:connector_by_key:${ids.connectorKey}`, {
    connector_id: ids.connector,
    connector_key: ids.connectorKey,
    connector_secret: connectorSecret,
    workspace_id: ids.workspace,
    channel_id: ids.channel,
    enabled: true,
  });
}

async function health() {
  const response = await fetch(`${BASE_URL}/health`);
  const body = await response.json();
  if (!response.ok || body.status !== 'ok') {
    throw new Error(`Health check failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function sendEvents(events) {
  const rawBody = JSON.stringify({ events });
  const timestamp = new Date().toISOString();
  const signature = await signConnectorPayload({ secret: connectorSecret, timestamp, rawBody });
  const response = await fetch(`${BASE_URL}/v1/events/${ids.connectorKey}`, {
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

function normalEvents(runId) {
  const start = Date.now() - 60_000;
  return Array.from({ length: 20 }, (_, index) => ({
    idempotency_key: `generic-smoke:${runId}:normal:${index}`,
    signal_key: signalKey,
    occurred_at: new Date(start + index * 1000).toISOString(),
    value: { num: 5 },
    fields: { source: 'generic-slack-smoke' },
  }));
}

function triggerEvent(runId) {
  return {
    idempotency_key: `generic-smoke:${runId}:trigger`,
    signal_key: signalKey,
    occurred_at: new Date().toISOString(),
    value: { num: 15 },
    fields: { source: 'generic-slack-smoke' },
  };
}

async function smokeCounts() {
  const [alerts, deliveries, sentDeliveries, aggregates] = await Promise.all([
    d1First('SELECT COUNT(*) AS count FROM alerts WHERE channel_id = ?', [ids.channel]),
    d1First(
      `SELECT COUNT(*) AS count
       FROM alert_deliveries
       WHERE subscriber_id = ?`,
      [ids.subscriber],
    ),
    d1First(
      `SELECT COUNT(*) AS count
       FROM alert_deliveries
       WHERE subscriber_id = ? AND status = 'sent'`,
      [ids.subscriber],
    ),
    d1First('SELECT COUNT(*) AS count FROM aggregates WHERE signal_id = ?', [ids.signal]),
  ]);
  return {
    alerts: Number(alerts?.count || 0),
    deliveries: Number(deliveries?.count || 0),
    sent_deliveries: Number(sentDeliveries?.count || 0),
    aggregates: Number(aggregates?.count || 0),
  };
}

async function latestDelivery() {
  return d1First(
    `SELECT status, response_code, response_body, updated_at
     FROM alert_deliveries
     WHERE subscriber_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [ids.subscriber],
  );
}

async function assertNoNormalAlert(before) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await sleep(2500);
    const counts = await smokeCounts();
    if (counts.alerts > before.alerts) {
      throw new Error(`Normal events unexpectedly created an alert: ${JSON.stringify(counts)}`);
    }
  }
}

async function waitForSlackDelivery() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const counts = await smokeCounts();
    const delivery = await latestDelivery();
    if (counts.sent_deliveries > 0) {
      return { counts, delivery };
    }
    if (delivery?.status === 'failed') {
      throw new Error(`Slack delivery failed: ${JSON.stringify(delivery)}`);
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for Slack delivery. Latest delivery: ${JSON.stringify(await latestDelivery())}`);
}

requireRuntimeInputs();

const runId = `${Date.now()}`;
const startedAt = new Date().toISOString();
const deployedHealth = await health();
await cleanupSmokeRows();
await seedSmokeRows();
const before = await smokeCounts();
const normalAccepted = await sendEvents(normalEvents(runId));
await assertNoNormalAlert(before);
const afterNormal = await smokeCounts();
const triggerAccepted = await sendEvents([triggerEvent(runId)]);
const delivered = await waitForSlackDelivery();

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: BASE_URL,
      slack_destination: redactSlackUrl(SLACK_WEBHOOK_URL),
      health: {
        status: deployedHealth.status,
        app: deployedHealth.app,
      },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        connector_key: ids.connectorKey,
        signal_key: signalKey,
        watch: 'LAST_VALUE_GT threshold 10',
      },
      ingest: {
        normal_events_sent: 20,
        normal_events_queued: normalAccepted.queued,
        trigger_events_sent: 1,
        trigger_events_queued: triggerAccepted.queued,
      },
      counts: {
        before,
        after_normal: afterNormal,
        after_trigger: delivered.counts,
      },
      expected_slack_text: 'Generic smoke metric high is warning at 15.',
      latest_delivery: delivered.delivery,
    },
    null,
    2,
  ),
);
