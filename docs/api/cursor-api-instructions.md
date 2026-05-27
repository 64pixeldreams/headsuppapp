# Cursor API Instructions

This is the short copy-paste guide for using Heads Up from Cursor or a script. For the full learning path, use [quickstart.md](quickstart.md). For first-run keys, use [getting-started-api-keys.md](getting-started-api-keys.md). For Slack/generic callbacks, use [webhook-receivers.md](webhook-receivers.md). For feature choices, use [watch-types.md](watch-types.md). For value-based patterns, use [use-cases.md](use-cases.md). For full schemas, use [reference.md](reference.md).

For Node or Cloudflare Workers, prefer the wrapper in [node-cloudflare-client.md](node-cloudflare-client.md).

All examples use fake IDs and fake secrets. Never commit real API keys, connector secrets, Cloudflare tokens, or Slack webhook URLs.

## Environment

PowerShell:

```powershell
$env:HEADSUPP_BASE_URL = "https://api.headsupp.io"
$env:HEADSUPP_API_KEY = "<service api key>"
$env:HEADSUPP_BOOTSTRAP_TOKEN = "<operator bootstrap token>"
$env:CONNECTOR_SECRET = "<connector secret>"
$env:CONNECTOR_KEY = "ck_demo"
```

## Health

```powershell
Invoke-RestMethod "$env:HEADSUPP_BASE_URL/health"
```

Expected role:

```text
attention-processing-api
```

## Bootstrap A Service API Key

Only use this when no service key exists yet.

```powershell
$body = @{
  action = "operator.bootstrapServiceApiKey"
  payload = @{
    name = "Heads Up provisioning service"
    user_id = "service:headsupp-operator"
    permissions = @(
      "workspace:create",
      "channel:create",
      "connector:create",
      "subscriber:create",
      "subscriber:update",
      "subscriber:delete",
      "signal:create",
      "watch:create",
      "channel_contract:create",
      "channel_contract:update",
      "channel_contract:read",
      "alert:read",
      "watch:read",
      "watch:control"
    )
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Method Post `
  -Uri "$env:HEADSUPP_BASE_URL/api/function" `
  -Headers @{ "X-HeadsUp-Bootstrap-Token" = $env:HEADSUPP_BOOTSTRAP_TOKEN } `
  -ContentType "application/json" `
  -Body $body
```

The response returns `api_key` once. Store it outside the repo and use it as `Authorization: Bearer <api_key>`.

## Call A Control-Plane Action

```powershell
function Invoke-HeadsUpAction {
  param(
    [string]$Action,
    [hashtable]$Payload
  )

  $body = @{
    action = $Action
    payload = $Payload
  } | ConvertTo-Json -Depth 12

  Invoke-RestMethod `
    -Method Post `
    -Uri "$env:HEADSUPP_BASE_URL/api/function" `
    -Headers @{ Authorization = "Bearer $env:HEADSUPP_API_KEY" } `
    -ContentType "application/json" `
    -Body $body
}
```

## Create A Workspace

```powershell
Invoke-HeadsUpAction "admin.createWorkspace" @{
  name = "Demo Workspace"
  source_app = "headsupp-demo"
  external_tenant_id = "demo-tenant"
  external_user_id = "demo-user"
}
```

Save the returned `workspace.id`.

## Create A Channel

```powershell
Invoke-HeadsUpAction "admin.createChannel" @{
  workspace_id = "ws_demo"
  name = "Demo Channel"
  purpose = "Demo attention stream"
}
```

Save the returned `channel.id`.

## Create A Channel Contract

Use this when a channel should define default dimensions, CTA policy, and template watches.

```powershell
Invoke-HeadsUpAction "admin.createChannelContract" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  purpose = "Forecast attention monitoring"
  expected_signal_types = @("forecast_state")
  default_dimensions = @("forecast_id", "status")
  default_watch_templates = @(
    @{
      name = "Pace below warning"
      watch_type = "LAST_VALUE_LT"
      config = @{
        threshold = 85
        severity = "warning"
      }
      cooldown_seconds = 86400
    }
  )
  cta_policy = @{
    required = $true
    kind = "review"
  }
}
```

## Create A Connector

```powershell
Invoke-HeadsUpAction "admin.createConnector" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  connector_type = "webhook"
}
```

Save:

```text
connector.connector_key
connector.connector_secret
```

The secret is shown once and signs event ingest.

## Create A Signal

```powershell
Invoke-HeadsUpAction "admin.createSignal" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  signal_key = "demo.metric"
  signal_type = "metric"
  value_mode = "last"
  contract = @{
    default_bucket_types = @("minute", "hour")
    dimensions = @("source")
  }
}
```

If the channel has an active contract, omitted defaults are inherited.

## Create Watches

Last value threshold:

```powershell
Invoke-HeadsUpAction "admin.createWatch" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  signal_id = "sig_demo"
  name = "Demo metric high"
  watch_type = "LAST_VALUE_GT"
  config = @{
    threshold = 10
    severity = "warning"
    bucket_type = "minute"
  }
  cooldown_seconds = 3600
}
```

Missing expected:

```powershell
Invoke-HeadsUpAction "admin.createWatch" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  signal_id = "sig_demo"
  name = "Demo metric missing"
  watch_type = "MISSING_EXPECTED"
  config = @{
    expected_every = @{ unit = "hour"; count = 3 }
    grace_seconds = 3600
    minimum_count = 1
    bucket_type = "hour"
    dimensions = @{ source = "demo" }
    severity = "warning"
  }
  cooldown_seconds = 3600
}
```

Aggregate forward:

```powershell
Invoke-HeadsUpAction "admin.createWatch" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  signal_id = "sig_demo"
  name = "Forward hourly demo metric"
  watch_type = "AGGREGATE_FORWARD"
  config = @{
    bucket_type = "hour"
    subscriber_id = "sub_forward"
    dimensions = @{ source = "demo" }
    include = @{
      sum = $true
      count = $true
      avg = $true
      min = $true
      max = $true
      last = $true
    }
  }
}
```

Other supported watch types:

```text
LAST_VALUE_GT
LAST_VALUE_LT
WINDOW_AVG_GT
WINDOW_AVG_LT
WINDOW_SUM_GT
WINDOW_COUNT_GT
DELTA_GT
DELTA_LT
PERCENT_CHANGE_GT
PERCENT_CHANGE_LT
PREVIOUS_PERIOD_RATIO_GT
PREVIOUS_PERIOD_RATIO_LT
SPIKE_GT
MISSING_EXPECTED
REMINDER_DUE
DIGEST
AGGREGATE_FORWARD
```

## Create Subscribers

Slack alert subscriber:

```powershell
Invoke-HeadsUpAction "admin.createSubscriber" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  subscriber_type = "slack_webhook"
  destination_url = "<runtime Slack webhook URL>"
  display_name = "#demo-alerts"
  mode = "alert"
}
```

Generic aggregate-forward subscriber:

```powershell
Invoke-HeadsUpAction "admin.createSubscriber" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  subscriber_type = "webhook"
  destination_url = "https://example.com/heads-up/aggregate"
  display_name = "Demo aggregate receiver"
  mode = "aggregate_forward"
}
```

Quiet summary subscriber:

```powershell
Invoke-HeadsUpAction "admin.createSubscriber" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  subscriber_type = "webhook"
  destination_url = "https://example.com/heads-up/quiet"
  mode = "quiet_summary"
  config = @{ schedule = "hourly" }
}
```

## Sign And Send An Event

```powershell
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$json = @{
  idempotency_key = "evt_demo_001"
  signal_key = "demo.metric"
  occurred_at = $timestamp
  value = @{ num = 15 }
  fields = @{ source = "demo" }
  cta = @{
    label = "View"
    url = "https://example.com/demo"
    kind = "review"
  }
} | ConvertTo-Json -Depth 8 -Compress

$hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($env:CONNECTOR_SECRET))
$bytes = [Text.Encoding]::UTF8.GetBytes("$timestamp.$json")
$signature = ($hmac.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""

Invoke-RestMethod `
  -Method Post `
  -Uri "$env:HEADSUPP_BASE_URL/v1/events/$env:CONNECTOR_KEY" `
  -Headers @{
    "X-HeadsUp-Timestamp" = $timestamp
    "X-HeadsUp-Signature" = "sha256=$signature"
  } `
  -ContentType "application/json" `
  -Body $json
```

Expected response:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0
}
```

## Verify Alerts And Quiet State

Watch state:

```powershell
Invoke-HeadsUpAction "admin.getWatchState" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  watch_id = "watch_demo"
}
```

Recent alerts:

```powershell
Invoke-HeadsUpAction "admin.listChannelAlerts" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  limit = 25
}
```

Alert timeline:

```powershell
Invoke-HeadsUpAction "admin.listAlertTimeline" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  limit = 25
}
```

## Control Attention

Snooze:

```powershell
Invoke-HeadsUpAction "admin.snoozeWatch" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  watch_id = "watch_demo"
  snooze_until = "2026-05-24T12:00:00.000Z"
  reason = "Maintenance window"
}
```

Mute:

```powershell
Invoke-HeadsUpAction "admin.muteWatch" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  watch_id = "watch_demo"
  reason = "Noisy source"
}
```

Resume:

```powershell
Invoke-HeadsUpAction "admin.resumeWatch" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  watch_id = "watch_demo"
}
```

Ignore alert:

```powershell
Invoke-HeadsUpAction "admin.ignoreAlert" @{
  workspace_id = "ws_demo"
  channel_id = "ch_demo"
  alert_id = "alert_demo"
}
```

## Observability

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer <operator token>" } `
  -Uri "$env:HEADSUPP_BASE_URL/api/v1/observability/overview"
```

Observability returns counts and health metadata, not raw event bodies, connector secrets, or webhook URLs.

## Run Proofs

Local:

```powershell
cd apps/headsupp-api
npm run check
npm run load:smoke
```

Slack-backed:

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL = "<runtime Slack webhook URL>"
$env:HEADSUPP_SMOKE_DISPATCH_SLACK = "true"
npm run smoke:generic-slack
npm run smoke:alert-decisions
npm run smoke:generic-slack
```

Deployed non-Slack:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN = "<runtime Cloudflare token>"
npm run smoke:scheduled
npm run smoke:delivery-retry
npm run smoke:tenant-isolation
npm run soak:release
```

## Common Errors

```text
AUTH_REQUIRED or PERMISSION_DENIED
Check Authorization: Bearer <api_key> and service key permissions.

MISSING_SIGNATURE or INVALID_SIGNATURE
Check X-HeadsUp-Timestamp, X-HeadsUp-Signature, and connector secret.

STALE_TIMESTAMP
Regenerate the timestamp immediately before signing.

TENANT_SCOPE_MISMATCH
Use resources owned by the same source_app/external_tenant_id as the API key.

WORKSPACE_CHANNEL_MISMATCH or SIGNAL_SCOPE_MISMATCH
Use channel_id and signal_id from the same workspace.

RAW_EVENTS_QUEUE_NOT_CONFIGURED
Check Worker queue bindings in the deployed environment.
```
