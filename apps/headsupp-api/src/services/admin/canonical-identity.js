import { normalizeEmailAddress } from '../subscribers/urls.js';

export function subscriberScopeChannelId({ workspaceId, channelId, subscriberScope }) {
  return subscriberScope === 'workspace' ? `__workspace__:${workspaceId}` : channelId;
}

export function canonicalSubscriberDestination(row = {}) {
  if (row.subscriber_type === 'email') {
    return normalizeEmailAddress(row.normalized_destination || row.destination_url || '');
  }
  return String(row.normalized_destination || row.destination_url || '').trim();
}

export function subscriberAuthorizationStatus(row = {}) {
  try {
    return JSON.parse(row.config_json || '{}')?.authorization?.status || null;
  } catch {
    return null;
  }
}

export function rankCanonicalSubscriber(row = {}) {
  return {
    authorized: subscriberAuthorizationStatus(row) === 'authorized' ? 1 : 0,
    enabled: Number(row.enabled) === 1 ? 1 : 0,
    updated_at: String(row.updated_at || ''),
    id: String(row.id || row.subscriber_id || ''),
  };
}

export function sortCanonicalSubscribers(rows = []) {
  return [...rows].sort((a, b) => {
    const ar = rankCanonicalSubscriber(a);
    const br = rankCanonicalSubscriber(b);
    if (ar.authorized !== br.authorized) return br.authorized - ar.authorized;
    if (ar.enabled !== br.enabled) return br.enabled - ar.enabled;
    const updated = br.updated_at.localeCompare(ar.updated_at);
    if (updated !== 0) return updated;
    return ar.id.localeCompare(br.id);
  });
}

export function parseWatchConfig(row = {}) {
  if (row.config && typeof row.config === 'object' && !Array.isArray(row.config)) return row.config;
  try {
    return JSON.parse(row.config_json || '{}') || {};
  } catch {
    return {};
  }
}

function normalizeWatchKey(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.split(':').filter(Boolean);
  return parts[parts.length - 1] || text;
}

function inferLogicalWatchKey(row = {}, config = parseWatchConfig(row)) {
  const explicit = normalizeWatchKey(row.watch_key || config.watch_key || config.logical_watch_key || config.attention_family);
  if (explicit) return explicit;
  if (config.family && (config.severity || row.severity)) return `${config.family}_${config.severity || row.severity}`;
  if (config.family) return config.family;
  if (config.event_type) return config.event_type;
  const watchId = String(row.watch_id || row.id || '').toLowerCase();
  if (watchId.includes('goal_reached')) return 'goal_reached';
  if (watchId.includes('bucket_close') || watchId.includes('bucket_closed')) return 'bucket_close';
  if (watchId.includes('trend_up')) return 'trend_up';
  if (watchId.includes('trend_down')) return 'trend_down';
  if (watchId.includes('forecast_change') || watchId.includes('adverse')) return 'forecast_change';
  if (watchId.includes('operational_stalled')) return 'operational_stalled';
  const severity = config.severity || row.severity || '';
  if (row.watch_type === 'LAST_VALUE_LT' && Number(config.threshold ?? row.threshold) === 85) return 'pace_warning';
  if (row.watch_type === 'LAST_VALUE_LT' && Number(config.threshold ?? row.threshold) === 70) return 'pace_critical';
  if (watchId.includes('pace') && severity) return `pace_${severity}`;
  if (watchId.includes('watch_warning') || watchId.includes(':warning')) return 'pace_warning';
  if (watchId.includes('watch_critical') || watchId.includes(':critical')) return 'pace_critical';
  return '';
}

export function logicalWatchIdentity(row = {}) {
  const config = parseWatchConfig(row);
  const channelId = row.channel_id || '';
  const signalId = row.signal_id || '';
  if (row.watch_group_id || row.band_key) {
    return [
      channelId,
      signalId,
      'group',
      row.watch_group_id || '',
      row.band_key || config.band_key || config.severity || '',
    ].join('|');
  }
  const explicitKey = inferLogicalWatchKey(row, config);
  if (explicitKey) return [channelId, signalId, 'watch', explicitKey].join('|');
  return [
    channelId,
    signalId,
    'watch',
    row.watch_type || '',
    config.event_type || '',
    config.dedupe_key_path || '',
    config.threshold ?? row.threshold ?? '',
    config.severity || row.severity || '',
  ].join('|');
}

