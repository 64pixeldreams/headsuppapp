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

The connector secret is returned only on creation and must be stored by the producer.

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
