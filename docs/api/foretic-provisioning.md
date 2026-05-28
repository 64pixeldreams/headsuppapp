# Foretic Provisioning API

Foretic uses this API to create Heads Up resources for a Foretic customer/user.

For new Foretic-style work, prefer the generic [SaaS integration guide](saas-integration-guide.md) and `admin.provisionChannel`. The older `foretic.*` actions are adapter conveniences and historical pilot references; they should not be the primary integration path for new alert-board work.

## Authentication

```text
Authorization: Bearer <foretic_service_api_key>
```

Foretic provisioning profile:

```text
foretic:provisioner => foretic:provision
```

## Tenant Context

Every Foretic provisioning request must include:

```json
{
  "source_app": "foretic",
  "external_tenant_id": "foretic_org_123",
  "external_user_id": "foretic_user_456",
  "external_account_id": "customer_or_workspace_id"
}
```

Foretic does not yet have tenants. Until Foretic adds an org/account tenant model, Heads Up uses the Foretic user id as both the tenant and user boundary:

```json
{
  "source_app": "foretic",
  "external_tenant_id": "user:mkfoxvxgoyfbtd",
  "external_user_id": "user:mkfoxvxgoyfbtd",
  "forecast_id": "oracle_forecast:mlfl1bfqrxnbk1",
  "forecast_name": "RB sales history (stripe)"
}
```

When Foretic later adds tenants, keep `external_user_id` as the Foretic user and move the org/account/customer id into `external_tenant_id`.

Current derived keys for the first test fixture:

```text
workspace_key = foretic:user:mkfoxvxgoyfbtd
channel_key = foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mlfl1bfqrxnbk1
```

Channel rows are persisted with schema-valid fields (`purpose = forecast`, `external_resource_id = forecast_id`, and `metadata_json.forecast_id`).

## Provision Workspace

CloudFunction:

```text
foretic.provisionWorkspace
```

Request:

```json
{
  "user_id": "user:mkfoxvxgoyfbtd",
  "name": "RB sales history (stripe)"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "created": true,
    "workspace": {
      "workspace_id": "ws_foretic_user_mkfoxvxgoyfbtd",
      "workspace_key": "foretic:user:mkfoxvxgoyfbtd",
      "name": "RB sales history (stripe)",
      "source_app": "foretic",
      "external_tenant_id": "user:mkfoxvxgoyfbtd",
      "external_user_id": "user:mkfoxvxgoyfbtd"
    }
  }
}
```

Foretic provisioning is D1-canonical for runtime entities:

```text
workspaces
channels
connectors
signals
signal_contracts
watches
subscribers
```

KV remains ingest-only for `connector_by_key` lookup.

## Create Forecast Watch

CloudFunction:

```text
foretic.createForecastWatch
```

Request:

```json
{
  "user_id": "user:mkfoxvxgoyfbtd",
  "forecast_id": "oracle_forecast:mlfl1bfqrxnbk1",
  "forecast_name": "RB sales history (stripe)",
  "slack_webhook_url": "https://hooks.slack.com/services/T_TEST/B_TEST/TEST_SECRET",
  "foretic_callback_url": "https://api.foretic.io/heads-up/callback"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "workspace": {
      "workspace_id": "ws_foretic_user_mkfoxvxgoyfbtd"
    },
    "channel": {
      "channel_id": "ch_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1",
      "channel_key": "foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mlfl1bfqrxnbk1"
    },
    "connector": {
      "connector_key": "ck_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_webhook",
      "connector_secret": "shown_once"
    },
    "event_url": "https://headsupp_app.example.workers.dev/v1/events/ck_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_webhook",
    "signal_contract": {
      "signal_key": "forecast.revenue.pace"
    },
    "watches": [
      {
        "watch_type": "LAST_VALUE_LT",
        "threshold": 85,
        "severity": "warning",
        "escalation_json": { "enabled": true, "condition": "value < 70", "severity": "critical" },
        "recovery_json": { "enabled": true, "condition": "value >= 95", "severity": "recovery" }
      },
      {
        "watch_type": "LAST_VALUE_LT",
        "threshold": 70,
        "severity": "critical",
        "recovery_json": { "enabled": true, "condition": "value >= 95", "severity": "recovery" }
      }
    ],
    "subscribers": [
      { "subscriber_type": "slack_webhook", "destination_url_redacted": "https://hooks.slack.com/services/T_TEST/..." },
      { "subscriber_type": "webhook", "mode": "aggregate_forward", "destination_url_redacted": "https://api.foretic.io/heads-up/callback/..." }
    ],
    "summary": {
      "event_url": "https://headsupp_app.example.workers.dev/v1/events/ck_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_webhook",
      "connector": {
        "connector_key": "ck_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_webhook",
        "connector_secret": "shown_once",
        "secret_returned": true
      }
    }
  }
}
```

The `connector_secret` is returned only when the webhook connector is first created. Repeat provisioning returns the same `connector_key` and `event_url`, but omits the secret.

## Foretic End-to-End Loop

1. Foretic calls `foretic.createForecastWatch` when a user chooses **Watch this forecast**.
2. Heads Up returns the `event_url`, `connector_key`, and one-time `connector_secret`.
3. Foretic stores the secret and signs every forecast state event with connector HMAC.
4. Heads Up ingests, queues, aggregates, evaluates watches, suppresses noise, and sends alert or aggregate-forward webhooks.
5. Foretic callback handlers dedupe aggregate retries using `dedupe_key` or `delivery_id`.

## Error Cases

```text
401 missing or invalid API key
403 API key lacks foretic:provision
400 missing external_tenant_id
400 missing external_user_id
400 invalid Slack webhook URL
409 forecast watch already exists if idempotency is not requested
```

## Related Stories

```text
43-foretic-external-tenant-context.md
45-foretic-provision-workspace.md
48-foretic-create-forecast-watch.md
66-foretic-d1-canonical-provisioning.md
72-foretic-recovery-semantics.md
```
