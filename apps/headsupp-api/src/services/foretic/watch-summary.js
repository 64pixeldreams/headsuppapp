export function foreticWatchSetupSummary(setup) {
  const watches = Array.isArray(setup?.watches) ? setup.watches : [];
  const subscribers = Array.isArray(setup?.subscribers) ? setup.subscribers : [];
  const signals = Array.isArray(setup?.signals) ? setup.signals : [];
  const families = Array.from(new Set(watches.map((watch) => watch.family || watch.config?.family).filter(Boolean)));

  return {
    workspace_id: setup.workspace?.workspace_id,
    channel_id: setup.channel?.channel_id,
    channel_key: setup.channel?.channel_key,
    event_url: setup.event_url,
    connector: {
      connector_key: setup.connector?.connector_key,
      connector_secret: setup.connector?.connector_secret,
      secret_returned: Boolean(setup.connector?.connector_secret),
    },
    signal_contract: {
      signal_key: setup.signal_contract?.signal_key,
      default_bucket_types: setup.signal_contract?.default_bucket_types || [],
      dimensions: setup.signal_contract?.dimensions || [],
    },
    enabled_alert_families: families,
    signals: signals.map((signal) => ({
      signal_id: signal.signal_id || signal.id,
      signal_key: signal.signal_key,
    })),
    watches: watches.map((watch) => ({
      watch_id: watch.watch_id,
      family: watch.family || watch.config?.family,
      signal_key: watch.signal_key,
      name: watch.name,
      watch_type: watch.watch_type,
      threshold: watch.threshold,
      severity: watch.severity,
      cooldown_seconds: watch.cooldown_seconds,
    })),
    subscribers: subscribers.map((subscriber) => ({
      subscriber_id: subscriber.subscriber_id,
      subscriber_type: subscriber.subscriber_type,
      mode: subscriber.mode,
      destination_url_redacted: subscriber.destination_url_redacted,
    })),
  };
}
