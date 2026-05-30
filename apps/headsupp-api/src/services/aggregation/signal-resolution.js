import { stableId } from '../ids/stable-id.js';

export const DEFAULT_SIGNAL_CONTRACT = Object.freeze({
  dimensions: [],
  default_bucket_types: ['minute', 'hour', 'day'],
  default_aggregate: 'avg',
});

function parseContract(value) {
  if (!value) return DEFAULT_SIGNAL_CONTRACT;
  if (typeof value === 'object') return { ...DEFAULT_SIGNAL_CONTRACT, ...value };
  try {
    return { ...DEFAULT_SIGNAL_CONTRACT, ...JSON.parse(value) };
  } catch {
    return DEFAULT_SIGNAL_CONTRACT;
  }
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function signalContractFromChannelContract(row) {
  if (!row) return DEFAULT_SIGNAL_CONTRACT;
  return {
    ...DEFAULT_SIGNAL_CONTRACT,
    dimensions: parseJson(row.default_dimensions_json, []),
    cta_policy: parseJson(row.cta_policy_json, {}),
  };
}

async function getSignal(db, channelId, signalKey) {
  return db
    .prepare('SELECT * FROM signals WHERE channel_id = ? AND signal_key = ? LIMIT 1')
    .bind(channelId, signalKey)
    .first();
}

function shortHash(value) {
  let hash = 5381;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function signalPrimaryId(channelId, signalKey) {
  const seed = `${channelId}:${signalKey}`;
  const normalized = String(seed)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const hash = shortHash(seed);
  const slug = normalized.slice(0, 62);
  return `sig_${slug}_${hash}`;
}

async function createSignal(db, message, now) {
  const id = signalPrimaryId(message.channelId, message.event.signal_key);
  const signal = {
    id,
    signal_id: id,
    workspace_id: message.workspaceId,
    channel_id: message.channelId,
    signal_key: message.event.signal_key,
    signal_type: 'metric',
    value_mode: 'avg',
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  await db
    .prepare(
      `INSERT INTO signals (
        id, signal_id, workspace_id, channel_id, signal_key, signal_type, value_mode, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      signal.id,
      signal.signal_id,
      signal.workspace_id,
      signal.channel_id,
      signal.signal_key,
      signal.signal_type,
      signal.value_mode,
      signal.status,
      signal.created_at,
      signal.updated_at,
    )
    .run();

  return signal;
}

async function getContract(db, signalId) {
  return db.prepare('SELECT * FROM signal_contracts WHERE signal_id = ? LIMIT 1').bind(signalId).first();
}

async function getChannelContract(db, channelId) {
  return db
    .prepare('SELECT * FROM channel_contracts WHERE channel_id = ? AND status = ? ORDER BY version DESC LIMIT 1')
    .bind(channelId, 'active')
    .first();
}

async function createDefaultContract(db, signal, now) {
  const channelContract = await getChannelContract(db, signal.channel_id);
  const contractRow = {
    id: stableId('contract', signal.id),
    signal_id: signal.id,
    contract_json: JSON.stringify(signalContractFromChannelContract(channelContract)),
    created_at: now,
    updated_at: now,
  };

  await db
    .prepare(
      `INSERT INTO signal_contracts (
        id, signal_id, contract_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(contractRow.id, contractRow.signal_id, contractRow.contract_json, contractRow.created_at, contractRow.updated_at)
    .run();

  return contractRow;
}

export async function resolveSignalAndContract(db, message, now = new Date().toISOString()) {
  let signal = await getSignal(db, message.channelId, message.event.signal_key);
  let signalCreated = false;
  if (!signal) {
    signal = await createSignal(db, message, now);
    signalCreated = true;
  }

  let contractRow = await getContract(db, signal.id);
  let contractCreated = false;
  if (!contractRow) {
    contractRow = await createDefaultContract(db, signal, now);
    contractCreated = true;
  }

  return {
    signal,
    contract: parseContract(contractRow.contract_json),
    signalCreated,
    contractCreated,
  };
}
