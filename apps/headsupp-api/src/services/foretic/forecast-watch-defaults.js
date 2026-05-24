export const FORETIC_FORECAST_SIGNAL_KEY = 'forecast.revenue.pace';

export function foreticForecastSignalContract({ channel, context, now }) {
  return {
    signal_contract_id: `${channel.channel_id}:signal:${FORETIC_FORECAST_SIGNAL_KEY}`,
    workspace_id: channel.workspace_id,
    channel_id: channel.channel_id,
    signal_key: FORETIC_FORECAST_SIGNAL_KEY,
    description: 'Forecast revenue pace percentage from Foretic.',
    value_path: 'fields.pace_percent',
    time_path: 'occurred_at',
    cta_path: 'cta',
    dimensions: ['forecast_id', 'status'],
    default_bucket_types: ['minute', 'hour', 'day'],
    default_aggregate: 'last',
    created_at: now,
    updated_at: now,
    source_app: context.source_app,
    external_tenant_id: context.external_tenant_id,
    external_user_id: context.external_user_id,
    external_resource_id: context.external_resource_id,
  };
}

export function foreticForecastWatchDefinitions({ channel, context, now }) {
  const base = {
    workspace_id: channel.workspace_id,
    channel_id: channel.channel_id,
    signal_key: FORETIC_FORECAST_SIGNAL_KEY,
    status: 'active',
    created_at: now,
    updated_at: now,
    source_app: context.source_app,
    external_tenant_id: context.external_tenant_id,
    external_user_id: context.external_user_id,
    external_resource_id: context.external_resource_id,
  };

  return [
    {
      ...base,
      watch_id: `${channel.channel_id}:watch:pace_warning`,
      watch_key: `${channel.channel_id}:pace_warning`,
      name: 'Forecast pace warning',
      watch_type: 'LAST_VALUE_LT',
      threshold: 85,
      severity: 'warning',
      cooldown_seconds: 3600,
    },
    {
      ...base,
      watch_id: `${channel.channel_id}:watch:pace_critical`,
      watch_key: `${channel.channel_id}:pace_critical`,
      name: 'Forecast pace critical',
      watch_type: 'LAST_VALUE_LT',
      threshold: 70,
      severity: 'critical',
      cooldown_seconds: 3600,
    },
    {
      ...base,
      watch_id: `${channel.channel_id}:watch:pace_recovery`,
      watch_key: `${channel.channel_id}:pace_recovery`,
      name: 'Forecast pace recovery',
      watch_type: 'LAST_VALUE_GT',
      threshold: 95,
      severity: 'recovery',
      cooldown_seconds: 3600,
    },
  ];
}
