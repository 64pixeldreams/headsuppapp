const SOURCE_APP = 'foretic';

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeForeticTenantContext(input = {}) {
  const externalUserId = cleanString(input.external_user_id || input.user_id);
  const externalTenantId = cleanString(input.external_tenant_id || input.tenant_id || externalUserId);
  const externalAccountId = cleanString(input.external_account_id || input.account_id || externalTenantId);
  const externalResourceId = cleanString(input.external_resource_id || input.forecast_id || input.resource_id);

  if (!externalUserId) {
    return {
      ok: false,
      code: 'MISSING_EXTERNAL_USER_ID',
      message: 'Foretic external_user_id or user_id is required.',
    };
  }

  if (!externalTenantId) {
    return {
      ok: false,
      code: 'MISSING_EXTERNAL_TENANT_ID',
      message: 'Foretic external_tenant_id could not be derived.',
    };
  }

  return {
    ok: true,
    context: {
      source_app: SOURCE_APP,
      external_tenant_id: externalTenantId,
      external_user_id: externalUserId,
      external_account_id: externalAccountId,
      external_resource_id: externalResourceId || null,
    },
  };
}

export function foreticWorkspaceKey(context) {
  return `${SOURCE_APP}:${context.external_tenant_id}`;
}

export function foreticForecastChannelKey(context, forecastId) {
  const cleanForecastId = cleanString(forecastId || context.external_resource_id);
  if (!cleanForecastId) {
    return {
      ok: false,
      code: 'MISSING_FORECAST_ID',
      message: 'forecast_id is required to create a Foretic forecast channel key.',
    };
  }

  return {
    ok: true,
    channel_key: `${SOURCE_APP}:${context.external_tenant_id}:forecast:${cleanForecastId}`,
  };
}

export function buildForeticForecastContext(input = {}) {
  const normalized = normalizeForeticTenantContext({
    ...input,
    external_resource_id: input.external_resource_id || input.forecast_id,
  });

  if (!normalized.ok) return normalized;

  const { context } = normalized;
  const channelKey = foreticForecastChannelKey(context, input.forecast_id || context.external_resource_id);
  if (!channelKey.ok) return channelKey;

  return {
    ok: true,
    context: {
      ...context,
      workspace_key: foreticWorkspaceKey(context),
      channel_key: channelKey.channel_key,
      forecast_id: input.forecast_id || context.external_resource_id,
      forecast_name: cleanString(input.forecast_name || input.name) || null,
    },
  };
}
