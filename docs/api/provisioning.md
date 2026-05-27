# One-Call Provisioning

Use `admin.provisionChannel` when a third-party app wants to create or repair a complete Heads Up channel runtime in one idempotent call.

This is the recommended setup path for new integrations. The older individual create actions remain supported and backward compatible.

## What It Creates Or Reuses

```text
workspace
channel
connector
channel contract, optional
signals
watches
channel subscribers
workspace subscribers
```

The action is safe to rerun. Existing resources are reused by stable keys.

## Required Permissions

For MVP, service keys calling `admin.provisionChannel` should include:

```text
workspace:create
channel:create
connector:create
signal:create
watch:create
subscriber:create
```

## SDK Example

```js
const setup = await headsup.provisionChannel({
  workspace: {
    workspace_key: 'foretic:tenant_123',
    name: 'Foretic tenant 123',
    source_app: 'foretic',
    external_tenant_id: 'tenant_123',
    external_user_id: 'user_123'
  },
  channel: {
    channel_key: 'foretic:tenant_123:forecast:job_456',
    name: 'Revenue forecast',
    purpose: 'forecast',
    metadata: { forecast_id: 'job_456' }
  },
  connector: {
    connector_key: 'ck_foretic_tenant_123_job_456'
  },
  signals: [
    {
      signal_key: 'forecast.revenue.pace',
      description: 'Forecast revenue pace percentage.'
    }
  ],
  watches: [
    {
      signal_key: 'forecast.revenue.pace',
      watch_key: 'pace_warning',
      name: 'Forecast pace warning',
      watch_type: 'LAST_VALUE_LT',
      config: { threshold: 85, severity: 'warning' },
      cooldown_seconds: 3600
    }
  ],
  subscribers: [
    {
      subscriber_type: 'email',
      destination_url: 'martin@example.com',
      mode: 'alert',
      config: { template_id: 'forecast_alert_v1' }
    }
  ],
  workspace_subscribers: [
    {
      subscriber_type: 'webhook',
      destination_url: 'https://app.foretic.io/api/heads-up/alerts',
      mode: 'alert',
      config: { signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET }
    }
  ]
});

console.log(setup.connector.connector_key);
console.log(setup.connector.connector_secret); // shown only when connector is newly created
```

## Raw API Example

```json
{
  "action": "admin.provisionChannel",
  "payload": {
    "workspace": {
      "workspace_key": "acme:tenant_1",
      "name": "Acme tenant 1",
      "source_app": "acme",
      "external_tenant_id": "tenant_1",
      "external_user_id": "user_1"
    },
    "channel": {
      "channel_key": "acme:tenant_1:monitor:revenue",
      "name": "Revenue monitor"
    },
    "connector": {
      "connector_key": "ck_acme_tenant_1_revenue"
    },
    "signals": [
      { "signal_key": "revenue.pace" }
    ],
    "watches": [
      {
        "signal_key": "revenue.pace",
        "watch_key": "pace_warning",
        "name": "Revenue pace warning",
        "watch_type": "LAST_VALUE_LT",
        "config": { "threshold": 85, "severity": "warning" }
      }
    ]
  }
}
```

## Response Shape

```json
{
  "ok": true,
  "created": {
    "workspace": true,
    "channel": true,
    "connector": true,
    "signals": 1,
    "watches": 1,
    "subscribers": 1,
    "workspace_subscribers": 1
  },
  "reused": {
    "workspace": false,
    "channel": false,
    "connector": false,
    "signals": 0,
    "watches": 0,
    "subscribers": 0,
    "workspace_subscribers": 0
  },
  "workspace": {},
  "channel": {},
  "connector": {},
  "secret_returned": true,
  "signals": [],
  "watches": [],
  "subscribers": [],
  "workspace_subscribers": []
}
```

## Stable Keys

```text
workspace_key   stable per third-party tenant/account
channel_key     stable per external resource
connector_key   stable ingest key
signal_key      stable signal inside a channel
watch_key       stable watch inside a channel
subscriber_key  optional stable subscriber override
```

Rerun the same payload to repair partial setup or confirm all resources still exist.

## Workspace Subscribers

`workspace_subscribers` create workspace-scoped alert callbacks. They receive alert deliveries for every channel in the workspace.

MVP support:

```text
subscriber_scope = workspace
subscriber_type = webhook
mode = alert
```

Use this for app-level callbacks, such as one Foretic alert callback per workspace.

Channel subscribers still work exactly as before and remain best for per-channel email or Slack recipients.

## Partial Failure

`admin.provisionChannel` writes resources in deterministic order and every write is idempotent. It does not roll back earlier successful steps. If a later step fails, fix the payload and rerun the same request.

Failure details identify the section and array index:

```json
{
  "code": "PROVISION_STEP_FAILED",
  "details": {
    "section": "watches",
    "index": 0,
    "cause": {
      "code": "SIGNAL_NOT_FOUND"
    }
  }
}
```

## Smoke Tests

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<cloudflare token>'
$env:HEADSUPP_API_KEY='<service api key>'
$env:HEADSUPP_SMOKE_EMAIL_DESTINATION='martin@example.com'
npm run smoke:provision-channel
npm run smoke:workspace-subscriber
```
