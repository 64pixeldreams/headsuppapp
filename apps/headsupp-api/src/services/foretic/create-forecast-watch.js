import { requireForeticProvision } from '../auth/permissions.js';
import { generateConnectorSecret, publicConnector } from '../connectors/secrets.js';
import { stableId } from '../ids/stable-id.js';
import { ownershipFieldsFromContext } from '../ownership/tenant-scope.js';
import { createSubscriber } from '../subscribers/create-subscriber.js';
import { buildForeticForecastContext } from './tenant-context.js';
import { foreticForecastSignalContract, foreticForecastWatchDefinitions } from './forecast-watch-defaults.js';
import { provisionForeticWorkspace } from './provision-workspace.js';
import { foreticWatchSetupSummary } from './watch-summary.js';

async function putIfMissing(store, type, key, valueFactory) {
  const existing = await store.get(type, key);
  if (existing) {
    return { created: false, value: existing };
  }

  const value = valueFactory();
  await store.put(type, key, value);
  return { created: true, value };
}

async function createForecastChannel({ store, workspace, context, now }) {
  return putIfMissing(store, 'channel', context.channel_key, () => ({
    channel_id: stableId('ch', context.channel_key),
    channel_key: context.channel_key,
    workspace_id: workspace.workspace_id,
    name: context.forecast_name || context.forecast_id,
    channel_type: 'forecast',
    status: 'active',
    created_at: now,
    updated_at: now,
    ...ownershipFieldsFromContext(context),
  }));
}

async function createForecastConnector({ store, workspace, channel, context, now, secretFactory }) {
  const connectorKey = `${context.channel_key}:webhook`;
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

async function createSignalContract({ store, channel, context, now }) {
  const contract = foreticForecastSignalContract({ channel, context, now });
  return putIfMissing(store, 'signal_contract', contract.signal_contract_id, () => contract);
}

async function createDefaultWatches({ store, channel, context, now }) {
  const definitions = foreticForecastWatchDefinitions({ channel, context, now });
  const results = [];

  for (const watch of definitions) {
    const result = await putIfMissing(store, 'watch', watch.watch_key, () => watch);
    results.push(result.value);
  }

  return results;
}

async function createRequestedSubscribers({ input, context, workspace, channel, store, now }) {
  const subscribers = [];

  if (input.slack_webhook_url) {
    const slack = await createSubscriber({
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
    const callback = await createSubscriber({
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
    now,
  });
  if (!workspaceResult.ok) return workspaceResult;

  const channelResult = await createForecastChannel({
    store,
    workspace: workspaceResult.workspace,
    context,
    now,
  });

  const connectorResult = await createForecastConnector({
    store,
    workspace: workspaceResult.workspace,
    channel: channelResult.value,
    context,
    now,
    secretFactory,
  });

  const signalContract = await createSignalContract({
    store,
    channel: channelResult.value,
    context,
    now,
  });

  const watches = await createDefaultWatches({
    store,
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
    watches,
    subscribers: subscriberResult.subscribers,
  };
  return {
    ...setup,
    summary: foreticWatchSetupSummary(setup),
  };
}
