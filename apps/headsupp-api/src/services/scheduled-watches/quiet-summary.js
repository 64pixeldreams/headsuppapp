import { stableId } from '../ids/stable-id.js';
import { parseWatchJson } from '../watches/evaluate-watch.js';
import { dispatchQuietSummaryDelivery } from '../delivery/quiet-summary.js';

function intervalMs(schedule = 'daily') {
  if (schedule === 'hourly') return 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function dueSince(now, schedule) {
  return new Date(Date.parse(now) - intervalMs(schedule)).toISOString();
}

function parseConfig(value) {
  return parseWatchJson(value);
}

export function buildQuietSummaryPayload({ channel, watches, statesByWatchId, now = new Date().toISOString() }) {
  let channelMetadata = {};
  try {
    channelMetadata = channel?.metadata_json ? JSON.parse(channel.metadata_json) : {};
  } catch {
    channelMetadata = {};
  }
  return {
    type: 'heads_up.quiet_summary',
    workspace_id: channel.workspace_id,
    channel_id: channel.channel_id || channel.id,
    channel_name: channel.name || null,
    channel_metadata: channelMetadata,
    status: 'quiet',
    generated_at: now,
    watches: watches.map((watch) => {
      const state = statesByWatchId.get(watch.id || watch.watch_id) || {};
      return {
        watch_id: watch.id || watch.watch_id,
        name: watch.name,
        watch_type: watch.watch_type,
        last_status: state.last_status || 'never_evaluated',
        last_evaluated_at: state.last_evaluated_at || null,
        last_alert_at: state.last_alert_at || null,
        cooldown_until: state.cooldown_until || null,
        updated_at: state.updated_at || null,
      };
    }),
  };
}

async function loadQuietSummaryScopes(db) {
  const result = await db
    .prepare(
      `SELECT DISTINCT s.workspace_id, s.channel_id
       FROM subscribers s
       WHERE s.mode = 'quiet_summary' AND s.enabled = 1`,
    )
    .all();
  return result?.results || [];
}

async function loadChannel(db, workspaceId, channelId) {
  return db
    .prepare('SELECT * FROM channels WHERE workspace_id = ? AND (id = ? OR channel_id = ?) LIMIT 1')
    .bind(workspaceId, channelId, channelId)
    .first();
}

async function loadQuietSummarySubscribers(db, workspaceId, channelId) {
  const result = await db
    .prepare(
      `SELECT *
       FROM subscribers
       WHERE workspace_id = ? AND channel_id = ? AND mode = 'quiet_summary' AND enabled = 1`,
    )
    .bind(workspaceId, channelId)
    .all();
  return result?.results || [];
}

async function loadWatches(db, workspaceId, channelId) {
  const result = await db
    .prepare('SELECT * FROM watches WHERE workspace_id = ? AND channel_id = ? AND enabled = 1 ORDER BY name')
    .bind(workspaceId, channelId)
    .all();
  return result?.results || [];
}

async function loadWatchStates(db, watchIds) {
  if (watchIds.length === 0) return new Map();
  const result = await db
    .prepare(`SELECT * FROM watch_states WHERE watch_id IN (${watchIds.map(() => '?').join(', ')})`)
    .bind(...watchIds)
    .all();
  return new Map((result?.results || []).map((row) => [row.watch_id, row]));
}

async function latestQuietSummaryDelivery(db, workspaceId, channelId) {
  return db
    .prepare(
      `SELECT *
       FROM quiet_summary_deliveries
       WHERE workspace_id = ? AND channel_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(workspaceId, channelId)
    .first();
}

function summaryDue({ subscribers, latest, now }) {
  const configs = subscribers.map((subscriber) => parseConfig(subscriber.config_json));
  const schedule = configs.find((config) => config.schedule)?.schedule || 'daily';
  if (!latest) return { due: true, schedule };
  return { due: Date.parse(latest.created_at) <= Date.parse(dueSince(now, schedule)), schedule };
}

function buildDelivery({ subscriber, payload, now }) {
  const id = stableId('quietdel', `${subscriber.id || subscriber.subscriber_id}:${payload.generated_at}`);
  return {
    id,
    workspace_id: subscriber.workspace_id,
    channel_id: subscriber.channel_id,
    subscriber_id: subscriber.id || subscriber.subscriber_id,
    destination_url: subscriber.destination_url,
    status: 'pending',
    attempt_count: 0,
    payload_json: JSON.stringify(payload),
    last_attempt_at: null,
    next_retry_at: now,
    response_code: null,
    response_body: null,
    created_at: now,
    updated_at: now,
  };
}

function deliveryStatement(db, delivery) {
  return db
    .prepare(
      `INSERT INTO quiet_summary_deliveries (
        id, workspace_id, channel_id, subscriber_id, destination_url, status, attempt_count,
        payload_json, last_attempt_at, next_retry_at, response_code, response_body, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      delivery.id,
      delivery.workspace_id,
      delivery.channel_id,
      delivery.subscriber_id,
      delivery.destination_url,
      delivery.status,
      delivery.attempt_count,
      delivery.payload_json,
      delivery.last_attempt_at,
      delivery.next_retry_at,
      delivery.response_code,
      delivery.response_body,
      delivery.created_at,
      delivery.updated_at,
    );
}

export async function evaluateQuietSummaryChannel({
  db,
  env = {},
  workspaceId,
  channelId,
  now = new Date().toISOString(),
  fetchFn,
  dispatch = true,
}) {
  const subscribers = await loadQuietSummarySubscribers(db, workspaceId, channelId);
  if (subscribers.length === 0) return { emitted: false, reason: 'NO_QUIET_SUMMARY_SUBSCRIBERS' };
  const latest = await latestQuietSummaryDelivery(db, workspaceId, channelId);
  const due = summaryDue({ subscribers, latest, now });
  if (!due.due) return { emitted: false, reason: 'QUIET_SUMMARY_NOT_DUE', schedule: due.schedule };
  const channel = (await loadChannel(db, workspaceId, channelId)) || { workspace_id: workspaceId, channel_id: channelId };
  const watches = await loadWatches(db, workspaceId, channelId);
  const statesByWatchId = await loadWatchStates(db, watches.map((watch) => watch.id || watch.watch_id));
  const payload = buildQuietSummaryPayload({ channel, watches, statesByWatchId, now });
  const deliveries = subscribers.map((subscriber) => buildDelivery({ subscriber, payload, now }));
  await db.batch(deliveries.map((delivery) => deliveryStatement(db, delivery)));
  if (dispatch) {
    for (const delivery of deliveries) {
      const subscriber = subscribers.find((row) => (row.id || row.subscriber_id) === delivery.subscriber_id);
      await dispatchQuietSummaryDelivery({ db, delivery, subscriber, env, fetchFn, now });
    }
  }
  return { emitted: true, schedule: due.schedule, watches: watches.length, deliveries: deliveries.length, payload };
}

export async function evaluateQuietSummaries({ db, env = {}, now = new Date().toISOString(), fetchFn, dispatch = true }) {
  const scopes = await loadQuietSummaryScopes(db);
  let emitted = 0;
  let deliveries = 0;
  for (const scope of scopes) {
    const result = await evaluateQuietSummaryChannel({
      db,
      env,
      workspaceId: scope.workspace_id,
      channelId: scope.channel_id,
      now,
      fetchFn,
      dispatch,
    });
    if (result.emitted) {
      emitted += 1;
      deliveries += result.deliveries;
    }
  }
  return { channels: scopes.length, emitted, deliveries };
}
