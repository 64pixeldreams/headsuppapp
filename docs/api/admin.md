# Admin API

Admin operations use CFKit CloudFunctions through:

```text
POST /api/function
Authorization: Bearer <api_key>
```

The request body is:

```json
{
  "action": "admin.createWorkspace",
  "payload": {}
}
```

These functions are control-plane APIs. They are not used by the hot ingest path.

## Functions

```text
admin.createWorkspace
admin.createChannel
admin.createConnector
admin.createSubscriber
admin.createSignal
admin.createWatch
```

## Permissions

```text
workspace:create
channel:create
connector:create
subscriber:create
signal:create
watch:create
```

The Foretic service permission set already includes these permissions plus `foretic:provision`.

## Operator Functions

Bootstrap and key lifecycle functions:

```text
operator.bootstrapServiceApiKey
operator.listServiceApiKeys
operator.revokeServiceApiKey
operator.rotateServiceApiKey
operator.listAuditLogs
```

`operator.bootstrapServiceApiKey` uses the runtime-only `X-HeadsUp-Bootstrap-Token` header and does not require an existing Bearer token. The list/revoke/rotate actions require `api_key:manage`. Audit reads require `audit:read`.

## Create Workspace

```json
{
  "action": "admin.createWorkspace",
  "payload": {
    "name": "Foretic Demo",
    "source_app": "foretic",
    "external_tenant_id": "user:mkfoxvxgoyfbtd",
    "external_user_id": "user:mkfoxvxgoyfbtd"
  }
}
```

## Create Channel

```json
{
  "action": "admin.createChannel",
  "payload": {
    "workspace_id": "ws_123",
    "name": "RB sales history (stripe)",
    "channel_key": "foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mlfl1bfqrxnbk1"
  }
}
```

## Create Connector

```json
{
  "action": "admin.createConnector",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "connector_type": "webhook"
  }
}
```

The connector secret is returned only on creation and must be stored by the producer. Connector metadata is also written to the control-plane KV lookup so the returned event URL can be used immediately for HMAC ingest.

## Create Subscriber

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "subscriber_type": "webhook",
    "destination_url": "https://api.example.com/heads-up/callback",
    "mode": "aggregate_forward"
  }
}
```

Subscriber responses include redacted URL metadata. Do not expose real Slack webhook URLs in logs or docs.

## Create Signal

```json
{
  "action": "admin.createSignal",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "signal_key": "forecast.revenue.pace",
    "signal_type": "forecast_state",
    "value_mode": "last",
    "contract": {
      "default_bucket_types": ["minute", "hour", "day"],
      "dimensions": ["forecast_id", "status"]
    }
  }
}
```

## Tenant Guards

Admin actions enforce workspace/channel/signal relationships before writing referenced resources:

```text
channel.workspace_id must match payload.workspace_id
signal.workspace_id and signal.channel_id must match payload
subscriber.channel_id must belong to payload.workspace_id
connector.channel_id must belong to payload.workspace_id
watch.signal_id must belong to payload.workspace_id and channel_id
```

Common safe errors:

```text
TENANT_SCOPE_MISMATCH
WORKSPACE_CHANNEL_MISMATCH
SIGNAL_SCOPE_MISMATCH
PERMISSION_DENIED
```

## Audit Logs

Sensitive control-plane actions write safe audit rows to D1. Audit metadata redacts raw API keys, connector secrets, tokens, and webhook destinations.

## Create Watch

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "signal_id": "sig_123",
    "name": "Pace below warning",
    "watch_type": "LAST_VALUE_LT",
    "config": {
      "threshold": 85,
      "severity": "warning"
    },
    "cooldown_seconds": 3600
  }
}
```
