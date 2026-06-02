import { redactUrl } from './runtime.mjs';

// Escape SQLite LIKE special characters so underscores and percent signs in
// scenario IDs are matched literally, not as wildcards.
function escapeLike(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function genericSmokeIds(scenarioId) {
  const normalized = String(scenarioId || 'generic')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return Object.freeze({
    scenarioId: normalized,
    workspace: `smoke_${normalized}_workspace`,
    channel: `smoke_${normalized}_channel`,
    connector: `smoke_${normalized}_connector`,
    connectorKey: `ck_smoke_${normalized}`,
    signal: `smoke_${normalized}_signal`,
    signalContract: `smoke_${normalized}_signal_contract`,
    channelContract: `smoke_${normalized}_channel_contract`,
    watch: `smoke_${normalized}_watch`,
    subscriber: `smoke_${normalized}_slack_subscriber`,
    quietSubscriber: `smoke_${normalized}_quiet_subscriber`,
    webhookSubscriber: `smoke_${normalized}_webhook_subscriber`,
  });
}

export async function cleanupGenericScenario(client, ids) {
  const statements = [
    ['DELETE FROM alert_deliveries WHERE alert_id IN (SELECT id FROM alerts WHERE channel_id = ?)', [ids.channel]],
    [`DELETE FROM email_test_messages WHERE run_id LIKE ? ESCAPE '\\' OR delivery_id LIKE ? ESCAPE '\\'`, [`%${escapeLike(ids.scenarioId)}%`, `%${escapeLike(ids.scenarioId)}%`]],
    ['DELETE FROM watch_occurrences WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM alerts WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM quiet_summary_deliveries WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watch_states WHERE watch_id = ? OR watch_id LIKE ?', [ids.watch, `${ids.watch}_%`]],
    ['DELETE FROM watch_group_states WHERE watch_group_id = ? OR watch_group_id LIKE ?', [`${ids.watch}_group`, `${ids.watch}_group%`]],
    [`DELETE FROM raw_event_dedupe WHERE idempotency_key LIKE ? ESCAPE '\\'`, [`generic-smoke:${escapeLike(ids.scenarioId)}:%`]],
    ['DELETE FROM aggregate_deliveries WHERE signal_id = ?', [ids.signal]],
    ['DELETE FROM aggregates WHERE signal_id = ?', [ids.signal]],
    ['DELETE FROM subscribers WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watches WHERE id = ? OR id LIKE ?', [ids.watch, `${ids.watch}_%`]],
    ['DELETE FROM watch_groups WHERE id = ? OR id LIKE ?', [`${ids.watch}_group`, `${ids.watch}_group%`]],
    ['DELETE FROM signal_contracts WHERE signal_id = ?', [ids.signal]],
    ['DELETE FROM signals WHERE id = ?', [ids.signal]],
    ['DELETE FROM channel_contracts WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM watch_action_controls WHERE channel_id = ?', [ids.channel]],
    ['DELETE FROM connectors WHERE id = ? OR connector_key = ?', [ids.connector, ids.connectorKey]],
    ['DELETE FROM channels WHERE id = ?', [ids.channel]],
    ['DELETE FROM workspaces WHERE id = ?', [ids.workspace]],
  ];

  for (const [sql, params] of statements) {
    await client.d1Query(sql, params);
  }
}

export async function provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl,
  subscriberUrl = slackWebhookUrl,
  subscriberType = 'slack_webhook',
  subscriberMode = 'alert',
  subscriberName = `Smoke ${ids.scenarioId} alerts`,
  signalKey = 'demo.metric',
  connectorSecret = `${ids.scenarioId}-secret-not-production`,
  watchName = 'Generic smoke metric high',
  watchType = 'LAST_VALUE_GT',
  watchConfig = { threshold: 10, severity: 'warning', bucket_type: 'minute' },
  cooldownSeconds = 60,
  recovery = null,
}) {
  const now = new Date().toISOString();
  await cleanupGenericScenario(client, ids);

  await client.d1Query(
    `INSERT INTO workspaces (
      id, workspace_id, workspace_key, name, source_app, external_tenant_id, external_user_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.workspace,
      ids.workspace,
      `headsupp:${ids.scenarioId}`,
      `Smoke ${ids.scenarioId} Workspace`,
      'headsupp-smoke',
      ids.scenarioId,
      `${ids.scenarioId}-user`,
      'active',
      now,
      now,
    ],
  );
  await client.d1Query(
    `INSERT INTO channels (
      id, channel_id, workspace_id, name, channel_key, purpose, status, source_app,
      external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.channel,
      ids.channel,
      ids.workspace,
      `Smoke ${ids.scenarioId} Channel`,
      `headsupp:${ids.scenarioId}:channel`,
      'Core smoke test channel',
      'active',
      'headsupp-smoke',
      ids.scenarioId,
      `${ids.scenarioId}-user`,
      `${ids.scenarioId}-resource`,
      now,
      now,
    ],
  );
  await client.d1Query(
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
      ids.scenarioId,
      `${ids.scenarioId}-user`,
      `${ids.scenarioId}-resource`,
      now,
      now,
    ],
  );
  await client.d1Query(
    `INSERT INTO subscribers (
      id, subscriber_id, workspace_id, channel_id, subscriber_type, name, destination_url, normalized_destination,
      destination_url_redacted, secret_hash, mode, config_json, enabled, source_app,
      external_tenant_id, external_user_id, external_resource_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ids.subscriber,
      ids.subscriber,
      ids.workspace,
      ids.channel,
      subscriberType,
      subscriberName,
      subscriberUrl,
      subscriberType === 'email' ? String(subscriberUrl || '').trim().toLowerCase() : subscriberUrl,
      redactUrl(subscriberUrl),
      null,
      subscriberMode,
      '{}',
      1,
      'headsupp-smoke',
      ids.scenarioId,
      `${ids.scenarioId}-user`,
      `${ids.scenarioId}-resource`,
      now,
      now,
    ],
  );
  await client.d1Query(
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
      `Smoke ${ids.scenarioId} metric`,
      'active',
      now,
      now,
    ],
  );
  await client.d1Query(
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
  await client.d1Query(
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
      watchName,
      watchType,
      JSON.stringify(watchConfig),
      cooldownSeconds,
      null,
      recovery ? JSON.stringify(recovery) : null,
      1,
      now,
      now,
    ],
  );

  await client.putKvJson(`control:connector_by_key:${ids.connectorKey}`, {
    connector_id: ids.connector,
    connector_key: ids.connectorKey,
    connector_secret: connectorSecret,
    workspace_id: ids.workspace,
    channel_id: ids.channel,
    enabled: true,
  });

  return {
    ids,
    signalKey,
    connectorKey: ids.connectorKey,
    connectorSecret,
    slackDestination: slackWebhookUrl ? redactUrl(slackWebhookUrl) : null,
    subscriberDestination: redactUrl(subscriberUrl),
  };
}

export async function updateGenericWatchConfig({ client, ids, config, recovery = undefined }) {
  if (recovery === undefined) {
    await client.d1Query('UPDATE watches SET config_json = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(config),
      new Date().toISOString(),
      ids.watch,
    ]);
    return;
  }

  await client.d1Query('UPDATE watches SET config_json = ?, recovery_json = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(config),
    recovery ? JSON.stringify(recovery) : null,
    new Date().toISOString(),
    ids.watch,
  ]);
}

export async function smokeCounts(client, ids) {
  const [alerts, deliveries, sentDeliveries, aggregates] = await Promise.all([
    client.d1First('SELECT COUNT(*) AS count FROM alerts WHERE channel_id = ?', [ids.channel]),
    client.d1First('SELECT COUNT(*) AS count FROM alert_deliveries WHERE subscriber_id = ?', [ids.subscriber]),
    client.d1First("SELECT COUNT(*) AS count FROM alert_deliveries WHERE subscriber_id = ? AND status = 'sent'", [
      ids.subscriber,
    ]),
    client.d1First('SELECT COUNT(*) AS count FROM aggregates WHERE signal_id = ?', [ids.signal]),
  ]);

  return {
    alerts: Number(alerts?.count || 0),
    deliveries: Number(deliveries?.count || 0),
    sent_deliveries: Number(sentDeliveries?.count || 0),
    aggregates: Number(aggregates?.count || 0),
  };
}

export async function latestDelivery(client, ids) {
  return client.d1First(
    `SELECT id, alert_id, status, attempt_count, response_code, response_body, updated_at
     FROM alert_deliveries
     WHERE subscriber_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [ids.subscriber],
  );
}

export async function latestAlert(client, ids) {
  return client.d1First(
    `SELECT id, severity, current_value, summary_text, triggered_at
     FROM alerts
     WHERE channel_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [ids.channel],
  );
}

export async function deliveryCountsBySubscriber(client, subscriberId) {
  const [deliveries, sent, retrying, failed] = await Promise.all([
    client.d1First('SELECT COUNT(*) AS count FROM alert_deliveries WHERE subscriber_id = ?', [subscriberId]),
    client.d1First("SELECT COUNT(*) AS count FROM alert_deliveries WHERE subscriber_id = ? AND status = 'sent'", [
      subscriberId,
    ]),
    client.d1First("SELECT COUNT(*) AS count FROM alert_deliveries WHERE subscriber_id = ? AND status = 'retrying'", [
      subscriberId,
    ]),
    client.d1First("SELECT COUNT(*) AS count FROM alert_deliveries WHERE subscriber_id = ? AND status = 'failed'", [
      subscriberId,
    ]),
  ]);

  return {
    deliveries: Number(deliveries?.count || 0),
    sent: Number(sent?.count || 0),
    retrying: Number(retrying?.count || 0),
    failed: Number(failed?.count || 0),
  };
}

export async function aggregateCounts(client, ids) {
  const row = await client.d1First('SELECT COUNT(*) AS count FROM aggregates WHERE signal_id = ?', [ids.signal]);
  return Number(row?.count || 0);
}
