import { requirePermission } from '../auth/permissions.js';
import { stableId } from '../ids/stable-id.js';
import {
  createAdminChannel,
  createAdminChannelContract,
  createAdminConnector,
  createAdminSignal,
  createAdminSubscriber,
  createAdminWatch,
  createAdminWatchGroup,
  createAdminWorkspace,
} from './control-plane.js';

function validationError(field, message = `${field} is required.`) {
  return {
    ok: false,
    status: 400,
    code: 'VALIDATION_ERROR',
    message,
    details: { action: 'admin.provisionChannel', field },
  };
}

function stepDebugContext(section, input = {}) {
  const stableKey = input.group_key || input.watch_group_key || input.watch_key || input.subscriber_key || input.signal_key || input.connector_key || input.channel_key || input.workspace_key || null;
  return {
    supplied_key: stableKey,
    group_key: input.group_key || input.watch_group_key || null,
    watch_key: input.watch_key || null,
    subscriber_key: input.subscriber_key || null,
    signal_key: input.signal_key || null,
    connector_key: input.connector_key || null,
    section,
  };
}

function stepError(section, result, index = null, input = null, extras = {}) {
  return {
    ok: false,
    status: result.status || 400,
    code: 'PROVISION_STEP_FAILED',
    message: index === null ? `${section} failed.` : `${section}[${index}] failed.`,
    details: {
      section,
      index,
      ...(input ? stepDebugContext(section, input) : {}),
      ...extras,
      cause: {
        code: result.code,
        message: result.message,
        details: result.details || null,
      },
    },
  };
}

function requireProvisionPermissions(auth) {
  const permissions = [
    'workspace:create',
    'channel:create',
    'connector:create',
    'signal:create',
    'watch:create',
    'subscriber:create',
  ];
  for (const permission of permissions) {
    const allowed = requirePermission(auth, permission);
    if (!allowed.ok) return allowed;
  }
  return null;
}

async function firstRow(db, sql, params = []) {
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.first === 'function') return prepared.first();
  return null;
}

async function loadWorkspace(db, { workspaceId, workspaceKey }) {
  if (workspaceId) {
    return firstRow(db, 'SELECT * FROM workspaces WHERE id = ? OR workspace_id = ? LIMIT 1', [workspaceId, workspaceId]);
  }
  if (workspaceKey) {
    return firstRow(db, 'SELECT * FROM workspaces WHERE workspace_key = ? LIMIT 1', [workspaceKey]);
  }
  return null;
}

function createdCounter() {
  return {
    workspace: false,
    channel: false,
    connector: false,
    channel_contract: false,
    signals: 0,
    watch_groups: 0,
    watches: 0,
    subscribers: 0,
    workspace_subscribers: 0,
  };
}

function reusedCounter() {
  return {
    workspace: false,
    channel: false,
    connector: false,
    channel_contract: false,
    signals: 0,
    watch_groups: 0,
    watches: 0,
    subscribers: 0,
    workspace_subscribers: 0,
  };
}

function updatedCounter() {
  return {
    subscribers: 0,
    workspace_subscribers: 0,
  };
}

function reconciledCounter() {
  return {
    disabled_watches: 0,
  };
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : null;
}

function replacementRules(replaces = {}) {
  if (!replaces || typeof replaces !== 'object' || Array.isArray(replaces)) return [];
  const rules = [];
  for (const watchId of asArray(replaces.watch_ids) || []) {
    if (typeof watchId === 'string' && watchId.trim()) rules.push({ type: 'exact', value: watchId.trim() });
  }
  for (const pattern of asArray(replaces.watch_id_patterns) || []) {
    if (typeof pattern === 'string' && pattern.trim()) rules.push({ type: 'like', value: `%${pattern.trim()}%` });
  }
  for (const prefix of asArray(replaces.watch_key_prefixes) || []) {
    if (typeof prefix === 'string' && prefix.trim()) rules.push({ type: 'like', value: `%${prefix.trim()}%` });
  }
  return rules;
}

async function reconcileReplacedWatches({ db, workspaceId, channelId, signalId, replaces, now }) {
  const rules = replacementRules(replaces);
  let disabled = 0;
  for (const rule of rules) {
    const sql = rule.type === 'exact'
      ? `UPDATE watches
         SET enabled = 0, updated_at = ?
         WHERE workspace_id = ? AND channel_id = ? AND signal_id = ?
           AND enabled = 1
           AND watch_group_id IS NULL
           AND (id = ? OR watch_id = ?)`
      : `UPDATE watches
         SET enabled = 0, updated_at = ?
         WHERE workspace_id = ? AND channel_id = ? AND signal_id = ?
           AND enabled = 1
           AND watch_group_id IS NULL
           AND watch_id LIKE ?`;
    const params = rule.type === 'exact'
      ? [now, workspaceId, channelId, signalId, rule.value, rule.value]
      : [now, workspaceId, channelId, signalId, rule.value];
    const result = await db.prepare(sql).bind(...params).run();
    disabled += Number(result?.meta?.changes || 0);
  }
  return disabled;
}

export async function provisionAdminChannel({ auth, db, env = {}, store, input, now }) {
  const denied = requireProvisionPermissions(auth);
  if (denied) return denied;

  const workspaceInput = input.workspace || null;
  const channelInput = input.channel || null;
  if (!workspaceInput && !input.workspace_id) return validationError('workspace', 'workspace or workspace_id is required.');
  if (!channelInput) return validationError('channel');

  const signalsInput = asArray(input.signals);
  const watchGroupsInput = asArray(input.watch_groups);
  const watchesInput = asArray(input.watches);
  const subscribersInput = asArray(input.subscribers);
  const workspaceSubscribersInput = asArray(input.workspace_subscribers);
  if (!signalsInput) return validationError('signals', 'signals must be an array when provided.');
  if (!watchGroupsInput) return validationError('watch_groups', 'watch_groups must be an array when provided.');
  if (!watchesInput) return validationError('watches', 'watches must be an array when provided.');
  if (!subscribersInput) return validationError('subscribers', 'subscribers must be an array when provided.');
  if (!workspaceSubscribersInput) {
    return validationError('workspace_subscribers', 'workspace_subscribers must be an array when provided.');
  }

  const created = createdCounter();
  const reused = reusedCounter();
  const updated = updatedCounter();
  const reconciled = reconciledCounter();
  let workspace = null;

  if (workspaceInput) {
    const workspaceResult = await createAdminWorkspace({ auth, db, input: workspaceInput, now });
    if (!workspaceResult.ok) return stepError('workspace', workspaceResult);
    workspace = workspaceResult.workspace;
    created.workspace = workspaceResult.created === true;
    reused.workspace = workspaceResult.created === false;
  } else {
    workspace = await loadWorkspace(db, { workspaceId: input.workspace_id });
    if (!workspace) return validationError('workspace_id', 'workspace_id was not found.');
    reused.workspace = true;
  }

  const channelResult = await createAdminChannel({
    auth,
    db,
    input: {
      ...channelInput,
      workspace_id: workspace.workspace_id || workspace.id,
    },
    now,
  });
  if (!channelResult.ok) return stepError('channel', channelResult);
  const channel = channelResult.channel;
  created.channel = channelResult.created === true;
  reused.channel = channelResult.created === false;

  let channelContract = null;
  if (input.channel_contract) {
    const activeContract = await firstRow(
      db,
      'SELECT * FROM channel_contracts WHERE channel_id = ? AND status = ? ORDER BY version DESC LIMIT 1',
      [channel.channel_id || channel.id, 'active'],
    );
    if (activeContract) {
      channelContract = activeContract;
      reused.channel_contract = true;
    } else {
      const contractResult = await createAdminChannelContract({
        auth,
        db,
        input: {
          ...input.channel_contract,
          workspace_id: workspace.workspace_id || workspace.id,
          channel_id: channel.channel_id || channel.id,
        },
        now,
      });
      if (!contractResult.ok) return stepError('channel_contract', contractResult);
      channelContract = contractResult.channel_contract;
      created.channel_contract = true;
    }
  }

  let connector = null;
  let secretReturned = false;
  if (input.connector) {
    const connectorResult = await createAdminConnector({
      auth,
      db,
      store,
      input: {
        ...input.connector,
        workspace_id: workspace.workspace_id || workspace.id,
        channel_id: channel.channel_id || channel.id,
      },
      now,
    });
    if (!connectorResult.ok) return stepError('connector', connectorResult);
    connector = connectorResult.connector;
    secretReturned = connectorResult.secret_returned === true;
    created.connector = connectorResult.created === true;
    reused.connector = connectorResult.created === false;
  }

  const signals = [];
  const signalByKey = new Map();
  for (const [index, signalInput] of signalsInput.entries()) {
    const signalResult = await createAdminSignal({
      auth,
      db,
      input: {
        ...signalInput,
        workspace_id: workspace.workspace_id || workspace.id,
        channel_id: channel.channel_id || channel.id,
      },
      now,
    });
    if (!signalResult.ok) return stepError('signals', signalResult, index, signalInput);
    signals.push(signalResult.signal);
    signalByKey.set(signalResult.signal.signal_key, signalResult.signal);
    if (signalResult.created === true) created.signals += 1;
    if (signalResult.created === false) reused.signals += 1;
  }

  const watches = [];
  const watchGroups = [];
  for (const [index, groupInput] of watchGroupsInput.entries()) {
    const signal = groupInput.signal_id
      ? { signal_id: groupInput.signal_id, id: groupInput.signal_id }
      : signalByKey.get(groupInput.signal_key);
    if (!signal) {
      return stepError('watch_groups', {
        status: 400,
        code: 'SIGNAL_NOT_FOUND',
        message: `No signal was found for watch_groups[${index}].signal_key.`,
      }, index, groupInput, {
        dependency: {
          type: 'signal',
          signal_key: groupInput.signal_key || null,
          reason: groupInput.signal_key
            ? 'signal was not present in this provision payload and was not found in the channel'
            : 'watch group did not include signal_id or signal_key',
        },
      });
    }
    const bands = asArray(groupInput.bands);
    if (!bands || bands.length === 0) {
      return stepError('watch_groups', {
        status: 400,
        code: 'INVALID_WATCH_GROUP',
        message: `watch_groups[${index}].bands must be a non-empty array.`,
      }, index, groupInput);
    }
    const bandKeys = new Set();
    for (const [bandIndex, band] of bands.entries()) {
      const bandKey = band.band_key || band.severity || String(bandIndex);
      if (bandKeys.has(bandKey)) {
        return stepError('watch_groups', {
          status: 400,
          code: 'DUPLICATE_BAND_KEY',
          message: `watch_groups[${index}].bands[${bandIndex}].band_key duplicates another band.`,
        }, index, groupInput, { band_index: bandIndex, band_key: bandKey });
      }
      bandKeys.add(bandKey);
    }
    const signalId = signal.id || signal.signal_id;
    reconciled.disabled_watches += await reconcileReplacedWatches({
      db,
      workspaceId: workspace.workspace_id || workspace.id,
      channelId: channel.channel_id || channel.id,
      signalId,
      replaces: groupInput.replaces,
      now,
    });
    const groupResult = await createAdminWatchGroup({
      auth,
      db,
      input: {
        ...groupInput,
        workspace_id: workspace.workspace_id || workspace.id,
        channel_id: channel.channel_id || channel.id,
        signal_id: signalId,
      },
      now,
    });
    if (!groupResult.ok) return stepError('watch_groups', groupResult, index, groupInput);
    const watchGroup = groupResult.watch_group;
    const groupWatches = [];
    if (groupResult.created === true) created.watch_groups += 1;
    if (groupResult.created === false) reused.watch_groups += 1;

    for (const [bandIndex, band] of bands.entries()) {
      const bandKey = band.band_key || band.severity || String(bandIndex);
      const watchId = band.watch_id || stableId(
        'watch',
        `${bandKey}:${channel.channel_id || channel.id}:${signalId}:${watchGroup.watch_group_id || watchGroup.id}`,
      );
      const watchResult = await createAdminWatch({
        auth,
        db,
        input: {
          ...band,
          watch_id: watchId,
          workspace_id: workspace.workspace_id || workspace.id,
          channel_id: channel.channel_id || channel.id,
          signal_id: signalId,
          watch_group_id: watchGroup.watch_group_id || watchGroup.id,
          band_key: bandKey,
          name: band.name || band.label || `${groupInput.name || groupInput.group_key} ${bandKey}`,
          config: {
            ...(band.config || {}),
            threshold: band.config?.threshold ?? band.threshold,
            severity: band.config?.severity || band.severity,
          },
          recovery: band.recovery || groupInput.recovery,
          cooldown_seconds: band.cooldown_seconds ?? groupInput.cooldown_seconds,
        },
        now,
      });
      if (!watchResult.ok) return stepError('watch_groups', watchResult, index, groupInput, { band_index: bandIndex, band_key: bandKey });
      groupWatches.push(watchResult.watch);
      watches.push(watchResult.watch);
      if (watchResult.created === true) created.watches += 1;
      if (watchResult.created === false) reused.watches += 1;
    }
    watchGroups.push({ ...watchGroup, watches: groupWatches });
  }

  for (const [index, watchInput] of watchesInput.entries()) {
    const signal = watchInput.signal_id
      ? { signal_id: watchInput.signal_id, id: watchInput.signal_id }
      : signalByKey.get(watchInput.signal_key);
    if (!signal) {
      return stepError('watches', {
        status: 400,
        code: 'SIGNAL_NOT_FOUND',
        message: `No signal was found for watches[${index}].signal_key.`,
      }, index, watchInput, {
        dependency: {
          type: 'signal',
          signal_key: watchInput.signal_key || null,
          reason: watchInput.signal_key
            ? 'signal was not present in this provision payload and was not found in the channel'
            : 'watch did not include signal_id or signal_key',
        },
      });
    }
    const signalId = signal.id || signal.signal_id;
    const watchId = watchInput.watch_id || (watchInput.watch_key
      ? stableId('watch', `${channel.channel_id || channel.id}:${signalId}:${watchInput.watch_key}`)
      : undefined);
    const watchResult = await createAdminWatch({
      auth,
      db,
      input: {
        ...watchInput,
        watch_id: watchId,
        workspace_id: workspace.workspace_id || workspace.id,
        channel_id: channel.channel_id || channel.id,
        signal_id: signalId,
      },
      now,
    });
    if (!watchResult.ok) return stepError('watches', watchResult, index, watchInput);
    watches.push(watchResult.watch);
    if (watchResult.created === true) created.watches += 1;
    if (watchResult.created === false) reused.watches += 1;
  }

  const subscribers = [];
  for (const [index, subscriberInput] of subscribersInput.entries()) {
    const subscriberResult = await createAdminSubscriber({
      auth,
      db,
      env,
      input: {
        ...subscriberInput,
        upsert_existing: true,
        subscriber_scope: 'channel',
        workspace_id: workspace.workspace_id || workspace.id,
        channel_id: channel.channel_id || channel.id,
      },
      now,
    });
    if (!subscriberResult.ok) return stepError('subscribers', subscriberResult, index, subscriberInput);
    subscribers.push(subscriberResult.subscriber);
    if (subscriberResult.created === true) created.subscribers += 1;
    if (subscriberResult.updated === true) updated.subscribers += 1;
    else if (subscriberResult.created === false) reused.subscribers += 1;
  }

  const workspaceSubscribers = [];
  for (const [index, subscriberInput] of workspaceSubscribersInput.entries()) {
    const subscriberResult = await createAdminSubscriber({
      auth,
      db,
      env,
      input: {
        ...subscriberInput,
        upsert_existing: true,
        subscriber_scope: 'workspace',
        workspace_id: workspace.workspace_id || workspace.id,
      },
      now,
    });
    if (!subscriberResult.ok) return stepError('workspace_subscribers', subscriberResult, index, subscriberInput);
    workspaceSubscribers.push(subscriberResult.subscriber);
    if (subscriberResult.created === true) created.workspace_subscribers += 1;
    if (subscriberResult.updated === true) updated.workspace_subscribers += 1;
    else if (subscriberResult.created === false) reused.workspace_subscribers += 1;
  }

  return {
    ok: true,
    created,
    reused,
    updated,
    reconciled,
    workspace,
    channel,
    channel_contract: channelContract,
    connector,
    secret_returned: secretReturned,
    signals,
    watch_groups: watchGroups,
    watches,
    subscribers,
    workspace_subscribers: workspaceSubscribers,
  };
}
