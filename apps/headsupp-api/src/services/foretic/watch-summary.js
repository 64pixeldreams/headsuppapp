export function foreticWatchSetupSummary(setup) {
  const watches = Array.isArray(setup?.watches) ? setup.watches : [];
  const subscribers = Array.isArray(setup?.subscribers) ? setup.subscribers : [];

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
    watches: watches.map((watch) => ({
      watch_id: watch.watch_id,
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
