import { requirePermission } from '../auth/permissions.js';
import { loadAlertRoutingContext } from '../alerts/persistence.js';
import { subscriberMatchesAlertFilters } from '../subscribers/alert-filters.js';

function denyIfNeeded(auth, permission) {
  const allowed = requirePermission(auth, permission);
  return allowed.ok ? null : allowed;
}

async function firstRow(db, sql, params = []) {
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.first === 'function') return prepared.first();
  return null;
}

async function allRows(db, sql, params = []) {
  const prepared = db.prepare(sql).bind(...params);
  if (typeof prepared.all !== 'function') return [];
  const result = await prepared.all();
  return result?.results || [];
}

function tenantMismatch(auth, row) {
  if (!row) return false;
  if (auth?.source_app && row.source_app && auth.source_app !== row.source_app) return true;
  if (auth?.external_tenant_id && row.external_tenant_id && auth.external_tenant_id !== row.external_tenant_id) return true;
  return false;
}

function ownershipError(code, message) {
  return { ok: false, status: 403, code, message };
}

async function loadWorkspace(db, workspaceId) {
  return firstRow(db, 'SELECT * FROM workspaces WHERE id = ? OR workspace_id = ? LIMIT 1', [workspaceId, workspaceId]);
}

async function loadChannel(db, channelId) {
  return firstRow(db, 'SELECT * FROM channels WHERE id = ? OR channel_id = ? LIMIT 1', [channelId, channelId]);
}

async function loadWatch(db, watchId) {
  return firstRow(db, 'SELECT * FROM watches WHERE id = ? OR watch_id = ? LIMIT 1', [watchId, watchId]);
}

async function requireWorkspaceScope({ db, auth, workspaceId }) {
  const workspace = await loadWorkspace(db, workspaceId);
  if (!workspace) return null;
  if (tenantMismatch(auth, workspace)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Workspace is outside the authenticated tenant scope.');
  }
  return null;
}

async function requireChannelScope({ db, auth, workspaceId, channelId }) {
  const channel = await loadChannel(db, channelId);
  if (!channel) return null;
  if (channel.workspace_id !== workspaceId) {
    return ownershipError('WORKSPACE_CHANNEL_MISMATCH', 'Channel does not belong to workspace.');
  }
  if (tenantMismatch(auth, channel)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Channel is outside the authenticated tenant scope.');
  }
  return null;
}

async function requireWatchScope({ db, auth, workspaceId, channelId, watchId }) {
  const watch = await loadWatch(db, watchId);
  if (!watch) return { ok: false, status: 404, code: 'WATCH_NOT_FOUND', message: 'Watch was not found.' };
  if (watch.workspace_id !== workspaceId || watch.channel_id !== channelId) {
    return ownershipError('WATCH_SCOPE_MISMATCH', 'Watch does not belong to workspace and channel.');
  }
  if (tenantMismatch(auth, watch)) {
    return ownershipError('TENANT_SCOPE_MISMATCH', 'Watch is outside the authenticated tenant scope.');
  }
  return null;
}

function parsePayload(row) {
  try {
    return row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    return {};
  }
}

function safeAlert(row) {
  const payload = parsePayload(row);
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    channel_id: row.channel_id,
    signal_id: row.signal_id,
    watch_id: row.watch_id,
    triggered_at: row.triggered_at,
    severity: row.severity,
    current_value: row.current_value,
    threshold_value: row.threshold_value,
    summary_text: row.summary_text,
    cta_label: row.cta_label || null,
    cta_url: row.cta_url || null,
    fields: payload.fields || {},
    created_at: row.created_at,
  };
}

function safeWatchState(row) {
  return {
    watch_id: row.watch_id,
    last_status: row.last_status || null,
    last_evaluated_at: row.last_evaluated_at || null,
    last_alert_at: row.last_alert_at || null,
    last_alert_value: row.last_alert_value ?? null,
    last_alert_severity: row.last_alert_severity || null,
    cooldown_until: row.cooldown_until || null,
    last_emitted_bucket_start_at: row.last_emitted_bucket_start_at || null,
    last_digest_at: row.last_digest_at || null,
    last_recovery_at: row.last_recovery_at || null,
    updated_at: row.updated_at,
  };
}

function summarizeResponseBody(value) {
  if (!value) return null;
  const text = String(value);
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

function safeDelivery(row) {
  return {
    id: row.id,
    alert_id: row.alert_id,
    subscriber_id: row.subscriber_id,
    status: row.status,
    attempt_count: row.attempt_count,
    last_attempt_at: row.last_attempt_at || null,
    next_retry_at: row.next_retry_at || null,
    response_code: row.response_code ?? null,
    response_body_summary: summarizeResponseBody(row.response_body),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function safeRawEvent(row) {
  if (!row) return null;
  return {
    idempotency_key: row.idempotency_key,
    workspace_id: row.workspace_id,
    channel_id: row.channel_id,
    signal_key: row.signal_key || null,
    received_at: row.received_at,
    status: row.status,
    processing_started_at: row.processing_started_at || null,
    aggregate_applied_at: row.aggregate_applied_at || null,
    processed_at: row.processed_at || null,
    updated_at: row.updated_at || null,
  };
}

function safeSubscriberMatch(subscriber, matched) {
  let filters = null;
  try {
    filters = JSON.parse(subscriber.config_json || '{}').filters || null;
  } catch {
    filters = null;
  }
  return {
    subscriber_id: subscriber.id || subscriber.subscriber_id,
    subscriber_type: subscriber.subscriber_type,
    mode: subscriber.mode,
    subscriber_scope: subscriber.subscriber_scope || 'channel',
    matched,
    filters,
  };
}

async function channelScopeDenied({ db, auth, input }) {
  return (
    (await requireWorkspaceScope({ db, auth, workspaceId: input.workspace_id })) ||
    (await requireChannelScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id }))
  );
}

export async function listAdminChannelAlerts({ auth, db, input, now = new Date().toISOString() }) {
  const denied = denyIfNeeded(auth, 'alert:read');
  if (denied) return denied;
  const scopeDenied = await channelScopeDenied({ db, auth, input });
  if (scopeDenied) return scopeDenied;
  const limit = Math.min(Number(input.limit || 50), 200);
  const rows = await allRows(
    db,
    `SELECT id, workspace_id, channel_id, signal_id, watch_id, triggered_at, severity, current_value, threshold_value,
      summary_text, payload_json, cta_label, cta_url, created_at
      FROM alerts
      WHERE workspace_id = ? AND channel_id = ?
      ORDER BY triggered_at DESC
      LIMIT ?`,
    [input.workspace_id, input.channel_id, limit],
  );
  const suppressed = await firstRow(
    db,
    `SELECT COUNT(*) AS count
      FROM watch_states
      WHERE watch_id IN (SELECT id FROM watches WHERE workspace_id = ? AND channel_id = ?)
        AND cooldown_until IS NOT NULL
        AND cooldown_until > ?`,
    [input.workspace_id, input.channel_id, now],
  );
  return {
    ok: true,
    alerts: rows.map(safeAlert),
    metadata: {
      suppressed_watch_count: Number(suppressed?.count || 0),
      as_of: now,
    },
  };
}

export async function getAdminWatchState({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'watch:read');
  if (denied) return denied;
  const scopeDenied =
    (await channelScopeDenied({ db, auth, input })) ||
    (await requireWatchScope({ db, auth, workspaceId: input.workspace_id, channelId: input.channel_id, watchId: input.watch_id }));
  if (scopeDenied) return scopeDenied;
  const row = await firstRow(db, 'SELECT * FROM watch_states WHERE watch_id = ? LIMIT 1', [input.watch_id]);
  return { ok: true, watch_state: row ? safeWatchState(row) : null };
}

export async function listAdminAlertTimeline({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'alert:read');
  if (denied) return denied;
  const scopeDenied = await channelScopeDenied({ db, auth, input });
  if (scopeDenied) return scopeDenied;
  const limit = Math.min(Number(input.limit || 100), 500);
  const rows = await allRows(
    db,
    `SELECT id, workspace_id, channel_id, signal_id, watch_id, triggered_at, severity, current_value, threshold_value,
      summary_text, payload_json, cta_label, cta_url, created_at
      FROM alerts
      WHERE workspace_id = ? AND channel_id = ?
      ORDER BY triggered_at DESC
      LIMIT ?`,
    [input.workspace_id, input.channel_id, limit],
  );
  return { ok: true, timeline: rows.map(safeAlert) };
}

export async function traceAdminEvent({ auth, db, input }) {
  const denied = denyIfNeeded(auth, 'alert:read');
  if (denied) return denied;
  const scopeDenied = await channelScopeDenied({ db, auth, input });
  if (scopeDenied) return scopeDenied;
  if (!input.idempotency_key) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'idempotency_key is required.',
      details: { action: 'admin.traceEvent', field: 'idempotency_key' },
    };
  }

  const rawEvent = await firstRow(
    db,
    `SELECT idempotency_key, workspace_id, channel_id, signal_key, received_at, status,
       processing_started_at, aggregate_applied_at, processed_at, updated_at
     FROM raw_event_dedupe
     WHERE idempotency_key = ? AND workspace_id = ? AND channel_id = ?
     LIMIT 1`,
    [input.idempotency_key, input.workspace_id, input.channel_id],
  );
  if (!rawEvent) {
    return {
      ok: true,
      trace: {
        idempotency_key: input.idempotency_key,
        found: false,
        raw_event: null,
        aggregates: [],
        watch_states: [],
        alerts: [],
        deliveries: [],
        subscriber_routing: [],
        summary: {
          accepted: false,
          alert_created: false,
          delivery_created: false,
          latest_delivery_status: null,
          suppression_reason: 'RAW_EVENT_NOT_FOUND',
        },
      },
    };
  }

  const signal = rawEvent.signal_key
    ? await firstRow(
      db,
      'SELECT id, signal_id, signal_key FROM signals WHERE channel_id = ? AND signal_key = ? LIMIT 1',
      [input.channel_id, rawEvent.signal_key],
    )
    : null;
  const signalId = signal?.id || signal?.signal_id || null;
  const aggregates = signalId
    ? await allRows(
      db,
      `SELECT id, signal_id, signal_key, bucket_type, bucket_start_at, dimensions_hash, dimensions_json,
         last_value, sum_value, count_value, updated_at
       FROM aggregates
       WHERE signal_id = ? AND updated_at >= ?
       ORDER BY updated_at DESC
       LIMIT 10`,
      [signalId, rawEvent.received_at],
    )
    : [];
  const watchStates = signalId
    ? await allRows(
      db,
      `SELECT w.id, w.watch_id, w.name, w.watch_type, w.watch_group_id, w.band_key,
         s.last_status, s.last_evaluated_at, s.last_alert_at, s.last_alert_value,
         s.last_alert_severity, s.cooldown_until, s.last_recovery_at, s.updated_at
       FROM watches w
       LEFT JOIN watch_states s ON s.watch_id = w.id OR s.watch_id = w.watch_id
       WHERE w.workspace_id = ? AND w.channel_id = ? AND w.signal_id = ?
       ORDER BY COALESCE(s.updated_at, w.updated_at) DESC
       LIMIT 50`,
      [input.workspace_id, input.channel_id, signalId],
    )
    : [];
  const alerts = signalId
    ? await allRows(
      db,
      `SELECT id, workspace_id, channel_id, signal_id, watch_id, triggered_at, severity,
         current_value, threshold_value, summary_text, payload_json, cta_label, cta_url, created_at
       FROM alerts
       WHERE workspace_id = ? AND channel_id = ? AND signal_id = ? AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [input.workspace_id, input.channel_id, signalId, rawEvent.received_at],
    )
    : [];
  const alertIds = alerts.map((alert) => alert.id);
  const deliveries = alertIds.length > 0
    ? await allRows(
      db,
      `SELECT id, alert_id, subscriber_id, status, attempt_count, last_attempt_at,
         next_retry_at, response_code, response_body, created_at, updated_at
       FROM alert_deliveries
       WHERE alert_id IN (${alertIds.map(() => '?').join(',')})
       ORDER BY updated_at DESC
       LIMIT 50`,
      alertIds,
    )
    : [];
  const subscribers = await allRows(
    db,
    `SELECT id, subscriber_id, subscriber_type, mode, subscriber_scope, config_json
     FROM subscribers
     WHERE enabled = 1
       AND mode = 'alert'
       AND (
         (COALESCE(subscriber_scope, 'channel') = 'channel' AND channel_id = ?)
         OR
         (subscriber_scope = 'workspace' AND workspace_id = ?)
       )`,
    [input.channel_id, input.workspace_id],
  );
  const subscriberRouting = [];
  for (const alert of alerts) {
    const context = await loadAlertRoutingContext(db, alert);
    subscriberRouting.push({
      alert_id: alert.id,
      context,
      subscribers: subscribers.map((subscriber) => safeSubscriberMatch(
        subscriber,
        subscriberMatchesAlertFilters(subscriber, context),
      )),
    });
  }
  const latestDelivery = deliveries[0] || null;
  const cooldownState = watchStates.find(
    (state) =>
      state.watch_type !== 'EVENT_OCCURRENCE' &&
      state.cooldown_until &&
      state.cooldown_until > new Date().toISOString(),
  );

  return {
    ok: true,
    trace: {
      idempotency_key: input.idempotency_key,
      found: true,
      raw_event: safeRawEvent(rawEvent),
      signal: signal ? { signal_id: signalId, signal_key: signal.signal_key } : null,
      aggregates,
      watch_states: watchStates.map((state) => ({
        watch_id: state.watch_id || state.id,
        name: state.name || null,
        watch_type: state.watch_type || null,
        watch_group_id: state.watch_group_id || null,
        band_key: state.band_key || null,
        last_status: state.last_status || null,
        last_evaluated_at: state.last_evaluated_at || null,
        last_alert_at: state.last_alert_at || null,
        last_alert_value: state.last_alert_value ?? null,
        last_alert_severity: state.last_alert_severity || null,
        cooldown_until: state.cooldown_until || null,
        last_recovery_at: state.last_recovery_at || null,
        updated_at: state.updated_at || null,
      })),
      alerts: alerts.map(safeAlert),
      deliveries: deliveries.map(safeDelivery),
      subscriber_routing: subscriberRouting,
      summary: {
        accepted: true,
        processed: rawEvent.status === 'processed' || Boolean(rawEvent.processed_at),
        aggregate_applied: Boolean(rawEvent.aggregate_applied_at),
        alert_created: alerts.length > 0,
        delivery_created: deliveries.length > 0,
        latest_delivery_status: latestDelivery?.status || null,
        suppression_reason: alerts.length > 0 ? null : cooldownState ? 'COOLDOWN_ACTIVE' : null,
      },
    },
  };
}
