import { requireForeticProvision } from '../auth/permissions.js';
import { generateConnectorSecret, publicConnector } from '../connectors/secrets.js';
import { stableId } from '../ids/stable-id.js';
import { ownershipFieldsFromContext } from '../ownership/tenant-scope.js';
import { createSubscriber } from '../subscribers/create-subscriber.js';
import { normalizeEmailAddress, redactUrl } from '../subscribers/urls.js';
import { logicalWatchIdentity } from '../admin/canonical-identity.js';
import { buildForeticForecastContext } from './tenant-context.js';
import {
  FORETIC_FORECAST_SIGNAL_KEY,
  foreticForecastSignalContract,
  foreticForecastWatchDefinitions,
} from './forecast-watch-defaults.js';
import { provisionForeticWorkspace } from './provision-workspace.js';
import { foreticWatchSetupSummary } from './watch-summary.js';

const TABLE_COLUMNS = Object.freeze({
  channels: [
    'id',
    'channel_id',
    'channel_key',
    'workspace_id',
    'name',
    'purpose',
    'status',
    'source_app',
    'external_tenant_id',
    'external_user_id',
    'external_resource_id',
    'metadata_json',
    'created_at',
    'updated_at',
  ],
  connectors: [
    'id',
    'connector_id',
    'connector_key',
    'connector_type',
    'connector_secret',
    'workspace_id',
    'channel_id',
    'status',
    'enabled',
    'source_app',
    'external_tenant_id',
    'external_user_id',
    'external_resource_id',
    'created_at',
    'updated_at',
  ],
  signals: [
    'id',
    'signal_id',
    'workspace_id',
    'channel_id',
    'signal_key',
    'signal_type',
    'value_mode',
    'status',
    'created_at',
    'updated_at',
  ],
  signal_contracts: ['id', 'signal_contract_id', 'signal_id', 'contract_json', 'created_at', 'updated_at'],
  watches: [
    'id',
    'watch_id',
    'workspace_id',
    'channel_id',
    'signal_id',
    'name',
    'watch_type',
    'config_json',
    'cooldown_seconds',
    'escalation_json',
    'recovery_json',
    'enabled',
    'created_at',
    'updated_at',
  ],
  subscribers: [
    'id',
    'subscriber_id',
    'workspace_id',
    'channel_id',
    'subscriber_type',
    'name',
    'destination_url',
    'normalized_destination',
    'destination_url_redacted',
    'mode',
    'enabled',
    'config_json',
    'subscriber_scope',
    'source_app',
    'external_tenant_id',
    'external_user_id',
    'external_resource_id',
    'created_at',
    'updated_at',
  ],
});

function filterRowForTable(table, row) {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => allowed.includes(key)));
}

async function putIfMissing(store, type, key, valueFactory) {
  const existing = await store.get(type, key);
  if (existing) {
    return { created: false, value: existing };
  }

  const value = valueFactory();
  await store.put(type, key, value);
  return { created: true, value };
}

async function insertIgnore(db, table, row) {
  const filtered = filterRowForTable(table, row);
  const columns = Object.keys(filtered);
  const placeholders = columns.map(() => '?').join(', ');
  await db
    .prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`)
    .bind(...columns.map((column) => filtered[column]))
    .run();
  return filtered;
}

async function first(db, sql, params) {
  return db.prepare(sql).bind(...params).first();
}

async function createForecastChannel({ store, db, workspace, context, now }) {
  if (db) {
    const channelKey = context.channel_key;
    const existing = await first(db, 'SELECT * FROM channels WHERE channel_key = ? LIMIT 1', [channelKey]);
    if (existing) return { created: false, value: existing };
    const channel = {
      id: stableId('ch', channelKey),
      channel_id: stableId('ch', channelKey),
      channel_key: channelKey,
      workspace_id: workspace.workspace_id,
      name: context.forecast_name || context.forecast_id,
      purpose: 'forecast',
      status: 'active',
      metadata_json: JSON.stringify({
        forecast_id: context.forecast_id,
      }),
      created_at: now,
      updated_at: now,
      ...ownershipFieldsFromContext(context, { external_resource_id: context.forecast_id }),
    };
    const inserted = await insertIgnore(db, 'channels', channel);
    return { created: true, value: inserted };
  }

  return putIfMissing(store, 'channel', context.channel_key, () => ({
    channel_id: stableId('ch', context.channel_key),
    channel_key: context.channel_key,
    workspace_id: workspace.workspace_id,
    name: context.forecast_name || context.forecast_id,
    purpose: 'forecast',
    status: 'active',
    metadata_json: JSON.stringify({
      forecast_id: context.forecast_id,
    }),
    created_at: now,
    updated_at: now,
    ...ownershipFieldsFromContext(context, { external_resource_id: context.forecast_id }),
  }));
}

async function createForecastConnector({ store, db, workspace, channel, context, now, secretFactory }) {
  const connectorKey = `${context.channel_key}:webhook`;
  if (db) {
    const connectorId = stableId('conn', connectorKey);
    const existing = await first(db, 'SELECT * FROM connectors WHERE connector_id = ? OR id = ? LIMIT 1', [connectorId, connectorId]);
    if (existing) {
      if (store) await store.put('connector_by_key', existing.connector_key, existing);
      return { created: false, value: existing };
    }
    const connector = {
      id: connectorId,
      connector_id: connectorId,
      connector_key: stableId('ck', connectorKey),
      connector_type: 'webhook',
      connector_secret: secretFactory(),
      workspace_id: workspace.workspace_id,
      channel_id: channel.channel_id,
      status: 'active',
      enabled: 1,
      created_at: now,
      updated_at: now,
      ...ownershipFieldsFromContext(context),
    };
    const inserted = await insertIgnore(db, 'connectors', connector);
    if (store) await store.put('connector_by_key', inserted.connector_key, inserted);
    return { created: true, value: inserted };
  }

  const result = await putIfMissing(store, 'connector', connectorKey, () => ({
    connector_id: stableId('conn', connectorKey),
    connector_key: stableId('ck', connectorKey),
    connector_type: 'webhook',
    connector_secret: secretFactory(),
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    enabled: true,
    created_at: now,
    updated_at: now,
    ...ownershipFieldsFromContext(context),
  }));

  if (result.created) {
    await store.put('connector_by_key', result.value.connector_key, result.value);
  }

  return result;
}

async function createSignalContract({ store, db, signal, channel, context, now }) {
  const contract = foreticForecastSignalContract({ channel, context, now });
  if (db) {
    const existing = await first(db, 'SELECT * FROM signal_contracts WHERE signal_id = ? LIMIT 1', [signal.id || signal.signal_id]);
    if (existing) {
      return { created: false, value: { ...contract, ...JSON.parse(existing.contract_json || '{}') } };
    }
    const signalContract = {
      id: stableId('sigct', signal.id || signal.signal_id),
      signal_contract_id: stableId('sigct', signal.id || signal.signal_id),
      signal_id: signal.id || signal.signal_id,
      contract_json: JSON.stringify(contract),
      created_at: now,
      updated_at: now,
    };
    await insertIgnore(db, 'signal_contracts', signalContract);
    return { created: true, value: contract };
  }
  return putIfMissing(store, 'signal_contract', contract.signal_contract_id, () => contract);
}

async function createSignal({ db, workspace, channel, context, now, signalKey = FORETIC_FORECAST_SIGNAL_KEY }) {
  const id = stableId('sig', `${channel.channel_id}:${signalKey}`);
  const existing = await first(
    db,
    'SELECT * FROM signals WHERE channel_id = ? AND signal_key = ? LIMIT 1',
    [channel.channel_id, signalKey],
  ) || await first(db, 'SELECT * FROM signals WHERE id = ? OR signal_id = ? LIMIT 1', [id, id]);
  if (existing) return { created: false, value: existing };
  const signal = filterRowForTable('signals', {
    id,
    signal_id: id,
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    signal_key: signalKey,
    signal_type: 'metric',
    value_mode: 'last',
    status: 'active',
    created_at: now,
    updated_at: now,
    ...ownershipFieldsFromContext(context),
  });
  await insertIgnore(db, 'signals', signal);
  const stored = await first(db, 'SELECT * FROM signals WHERE channel_id = ? AND signal_key = ? LIMIT 1', [
    channel.channel_id,
    signalKey,
  ]);
  return { created: true, value: stored || signal };
}

async function createDefaultSignals({ db, workspace, channel, context, now, signalKeys }) {
  const signals = new Map();
  for (const signalKey of signalKeys) {
    const result = await createSignal({ db, workspace, channel, context, now, signalKey });
    signals.set(signalKey, result.value);
  }
  return signals;
}

async function createDefaultWatches({ store, db, signalsByKey, channel, context, now }) {
  const definitions = foreticForecastWatchDefinitions({ channel, context, now });
  const results = [];

  for (const watch of definitions) {
    const signal = signalsByKey.get(watch.signal_key);
    if (db) {
      const existing = await first(db, 'SELECT * FROM watches WHERE watch_id = ? OR id = ? LIMIT 1', [watch.watch_id, watch.watch_id]);
      if (existing) {
        await disableLegacyLogicalWatches({ db, canonicalWatch: existing, watch, signal, channel, now });
        results.push(existing);
        continue;
      }
      const watchRow = {
        id: watch.watch_id,
        watch_id: watch.watch_id,
        workspace_id: channel.workspace_id,
        channel_id: channel.channel_id,
        signal_id: signal.id || signal.signal_id,
        name: watch.name,
        watch_type: watch.watch_type,
        config_json: JSON.stringify(watch.config || { threshold: watch.threshold, bucket_type: 'minute', severity: watch.severity }),
        cooldown_seconds: watch.cooldown_seconds,
        escalation_json: watch.escalation_json ? JSON.stringify(watch.escalation_json) : null,
        recovery_json: watch.recovery_json ? JSON.stringify(watch.recovery_json) : null,
        enabled: 1,
        created_at: now,
        updated_at: now,
      };
      const legacyMatches = await findLegacyLogicalWatches({ db, watchRow });
      await insertIgnore(db, 'watches', watchRow);
      await disableLegacyLogicalWatches({ db, canonicalWatch: watchRow, watch, signal, channel, now, legacyMatches });
      results.push({ ...watch, signal_id: signal.id || signal.signal_id });
      continue;
    }

    const result = await putIfMissing(store, 'watch', watch.watch_key, () => watch);
    results.push(result.value);
  }

  return results;
}

async function findLegacyLogicalWatches({ db, watchRow }) {
  const result = await db
    .prepare('SELECT * FROM watches WHERE workspace_id = ? AND channel_id = ? AND signal_id = ?')
    .bind(watchRow.workspace_id, watchRow.channel_id, watchRow.signal_id)
    .all();
  const identity = logicalWatchIdentity(watchRow);
  return (result?.results || []).filter((row) => logicalWatchIdentity(row) === identity);
}

async function disableLegacyLogicalWatches({ db, canonicalWatch, watch, signal, channel, now, legacyMatches = null }) {
  const canonicalId = canonicalWatch.id || canonicalWatch.watch_id;
  const canonicalWatchId = canonicalWatch.watch_id || canonicalWatch.id;
  const watchRow = {
    ...canonicalWatch,
    workspace_id: channel.workspace_id,
    channel_id: channel.channel_id,
    signal_id: signal.id || signal.signal_id,
    watch_type: watch.watch_type,
    config_json: JSON.stringify(watch.config || {}),
  };
  const matches = legacyMatches || await findLegacyLogicalWatches({ db, watchRow });
  for (const row of matches) {
    const rowId = row.id || row.watch_id;
    const rowWatchId = row.watch_id || row.id;
    if (rowId === canonicalId || rowWatchId === canonicalWatchId || Number(row.enabled) === 0) continue;
    await db.prepare('UPDATE watches SET enabled = 0, updated_at = ? WHERE id = ? OR watch_id = ?')
      .bind(now, rowId, rowWatchId)
      .run();
  }
}

async function createRequestedSubscribers({ input, context, workspace, channel, store, db, now }) {
  const subscribers = [];
  const upsertDbSubscriber = async ({ subscriber_type, destination_url, display_name, mode }) => {
    const normalizedDestination = subscriber_type === 'email' ? normalizeEmailAddress(destination_url) : destination_url;
    const subscriberId = stableId('sub', `${workspace.workspace_id}:${channel.channel_id}:${subscriber_type}:${mode}:${normalizedDestination}`);
    const existing =
      await first(db, 'SELECT * FROM subscribers WHERE id = ? OR subscriber_id = ? LIMIT 1', [subscriberId, subscriberId]) ||
      await first(
        db,
        `SELECT * FROM subscribers
         WHERE workspace_id = ? AND channel_id = ? AND subscriber_type = ? AND mode = ? AND normalized_destination = ?
         ORDER BY enabled DESC, updated_at DESC LIMIT 1`,
        [workspace.workspace_id, channel.channel_id, subscriber_type, mode, normalizedDestination],
      );
    if (existing) return { ok: true, subscriber: { ...existing, destination_url: undefined }, created: false };
    const subscriber = {
      id: subscriberId,
      subscriber_id: subscriberId,
      workspace_id: workspace.workspace_id,
      channel_id: channel.channel_id,
      subscriber_type,
      name: display_name,
      destination_url,
      normalized_destination: normalizedDestination,
      destination_url_redacted: redactUrl(destination_url),
      mode,
      enabled: 1,
      config_json: '{}',
      subscriber_scope: 'channel',
      created_at: now,
      updated_at: now,
      ...ownershipFieldsFromContext(context),
    };
    const inserted = await insertIgnore(db, 'subscribers', subscriber);
    return { ok: true, subscriber: { ...inserted, destination_url: undefined }, created: true };
  };

  if (input.slack_webhook_url) {
    const slack = db
      ? await upsertDbSubscriber({
          subscriber_type: 'slack_webhook',
          destination_url: input.slack_webhook_url,
          display_name: input.slack_display_name || 'Foretic forecast Slack alerts',
          mode: 'alert',
        })
      : await createSubscriber({
          input: {
            subscriber_type: 'slack_webhook',
            destination_url: input.slack_webhook_url,
            display_name: input.slack_display_name || 'Foretic forecast Slack alerts',
            mode: 'alert',
          },
          context,
          workspace,
          channel,
          store,
          now,
        });
    if (!slack.ok) return slack;
    subscribers.push(slack.subscriber);
  }

  if (input.foretic_callback_url) {
    const callback = db
      ? await upsertDbSubscriber({
          subscriber_type: 'webhook',
          destination_url: input.foretic_callback_url,
          display_name: input.foretic_callback_name || 'Foretic callback',
          mode: 'aggregate_forward',
        })
      : await createSubscriber({
          input: {
            subscriber_type: 'webhook',
            destination_url: input.foretic_callback_url,
            display_name: input.foretic_callback_name || 'Foretic callback',
            mode: 'aggregate_forward',
          },
          context,
          workspace,
          channel,
          store,
          now,
        });
    if (!callback.ok) return callback;
    subscribers.push(callback.subscriber);
  }

  return {
    ok: true,
    subscribers,
  };
}

export async function createForeticForecastWatch({
  auth,
  input,
  store,
  db,
  now = new Date().toISOString(),
  secretFactory = generateConnectorSecret,
  baseUrl = 'https://headsupp_app.example.workers.dev',
}) {
  const permission = requireForeticProvision(auth);
  if (!permission.ok) return permission;

  const forecastContext = buildForeticForecastContext(input);
  if (!forecastContext.ok) {
    return {
      ok: false,
      status: 400,
      code: forecastContext.code,
      message: forecastContext.message,
    };
  }

  const { context } = forecastContext;
  const workspaceResult = await provisionForeticWorkspace({
    auth,
    input: {
      ...input,
      name: input.workspace_name || input.forecast_name || input.name,
    },
    store,
    db,
    now,
  });
  if (!workspaceResult.ok) return workspaceResult;

  const channelResult = await createForecastChannel({
    store,
    db,
    workspace: workspaceResult.workspace,
    context,
    now,
  });

  const connectorResult = await createForecastConnector({
    store,
    db,
    workspace: workspaceResult.workspace,
    channel: channelResult.value,
    context,
    now,
    secretFactory,
  });

  const watchDefinitions = foreticForecastWatchDefinitions({ channel: channelResult.value, context, now });
  const signalKeys = Array.from(new Set(watchDefinitions.map((watch) => watch.signal_key)));
  const signalsByKey = db
    ? await createDefaultSignals({
        db,
        workspace: workspaceResult.workspace,
        channel: channelResult.value,
        context,
        now,
        signalKeys,
      })
    : new Map(signalKeys.map((signalKey) => [
        signalKey,
        {
          id: stableId('sig', `${channelResult.value.channel_id}:${signalKey}`),
          signal_id: stableId('sig', `${channelResult.value.channel_id}:${signalKey}`),
          signal_key: signalKey,
        },
      ]));
  const signalResult = {
    created: true,
    value: signalsByKey.get(FORETIC_FORECAST_SIGNAL_KEY),
  };

  const signalContract = await createSignalContract({
    store,
    db,
    signal: signalResult.value,
    channel: channelResult.value,
    context,
    now,
  });

  const watches = await createDefaultWatches({
    store,
    db,
    signalsByKey,
    channel: channelResult.value,
    context,
    now,
  });

  const subscriberResult = await createRequestedSubscribers({
    input,
    context,
    workspace: workspaceResult.workspace,
    channel: channelResult.value,
    store,
    db,
    now,
  });
  if (!subscriberResult.ok) return subscriberResult;

  const connector = publicConnector(connectorResult.value, {
    includeSecret: connectorResult.created,
  });

  const setup = {
    ok: true,
    created: {
      workspace: workspaceResult.created,
      channel: channelResult.created,
      connector: connectorResult.created,
      signal_contract: signalContract.created,
    },
    workspace: workspaceResult.workspace,
    channel: channelResult.value,
    connector,
    event_url: `${baseUrl.replace(/\/$/, '')}/v1/events/${connector.connector_key}`,
    signal_contract: signalContract.value,
    signals: Array.from(signalsByKey.values()),
    watches,
    subscribers: subscriberResult.subscribers,
  };
  return {
    ...setup,
    summary: foreticWatchSetupSummary(setup),
  };
}
