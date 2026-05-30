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
  const explicitKey =
    row.watch_key ||
    config.watch_key ||
    config.logical_watch_key ||
    config.attention_family ||
    config.family ||
    null;
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

