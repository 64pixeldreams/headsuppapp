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
watch groups, optional
watches
channel subscribers
workspace subscribers
```

The action is safe to rerun. Existing resources are reused by stable keys.

For SaaS integrations with many customer resources, also read [saas-integration-guide.md](saas-integration-guide.md). It explains when to use one channel per resource versus one channel per alert board.

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
  watch_groups: [
    {
      signal_key: 'forecast.revenue.pace',
      group_key: 'forecast_pace_health',
      name: 'Forecast pace health',
      winner_policy: 'highest_severity_wins',
      cooldown_seconds: 3600,
      recovery: { condition: 'value >= 95', severity: 'recovery' },
      bands: [
        {
          band_key: 'warning',
          severity: 'warning',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 85, bucket_type: 'minute' }
        },
        {
          band_key: 'critical',
          severity: 'critical',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 70, bucket_type: 'minute' }
        }
      ]
    }
  ],
  subscribers: [
    {
      subscriber_key: 'foretic:job_456:martin@example.com',
      subscriber_type: 'email',
      destination_url: 'martin@example.com',
      mode: 'alert',
      config: {
        template_id: 'forecast_alert_v1',
        authorization: { required: true },
        filters: {
          signal_keys: ['forecast.revenue.pace', 'forecast.goal.risk']
        }
      }
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
    "watch_groups": [
      {
        "signal_key": "revenue.pace",
        "group_key": "revenue_pace_health",
        "name": "Revenue pace health",
        "winner_policy": "highest_severity_wins",
        "cooldown_seconds": 3600,
        "recovery": { "condition": "value >= 95", "severity": "recovery" },
        "bands": [
          {
            "band_key": "warning",
            "severity": "warning",
            "watch_type": "LAST_VALUE_LT",
            "config": { "threshold": 85, "bucket_type": "minute" }
          },
          {
            "band_key": "critical",
            "severity": "critical",
            "watch_type": "LAST_VALUE_LT",
            "config": { "threshold": 70, "bucket_type": "minute" }
          }
        ]
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
    "watch_groups": 1,
    "watches": 2,
    "subscribers": 1,
    "workspace_subscribers": 1
  },
  "reused": {
    "workspace": false,
    "channel": false,
    "connector": false,
    "signals": 0,
    "watch_groups": 0,
    "watches": 0,
    "subscribers": 0,
    "workspace_subscribers": 0
  },
  "workspace": {},
  "channel": {},
  "connector": {},
  "secret_returned": true,
  "signals": [],
  "watch_groups": [],
  "watches": [],
  "subscribers": [],
  "workspace_subscribers": []
}
```

## Stable Keys

```text
workspace_key   stable per third-party tenant/account
channel_key     stable per external resource or alert board
connector_key   stable ingest key
signal_key      stable signal inside a channel
group_key       stable watch group inside a channel
band_key        stable severity/condition band inside a group
watch_key       stable watch inside a channel
subscriber_key  optional stable subscriber override
```

Rerun the same payload to repair partial setup or confirm all resources still exist. For provisioned subscribers, rerunning with the same `subscriber_key` can update mutable recipient preferences such as `name`, `mode`, `enabled`, and `config.filters`. Updating filters preserves email authorization and does not send another opt-in email. Changing an email destination is protected and should be modeled as a new subscriber or explicit reauthorization flow.

## Subscriber Alert Filters

Use subscriber alert filters when one channel has multiple alert types and each recipient chooses their own set.

Channel model:

```text
one channel per resource
  use when each resource needs separate consent/subscribers/cooldowns

one channel per user or alert board
  use when one opt-in should cover many resources
  put resource ids in fields/dimensions
  create one watch or watch_group per resource policy
  use subscriber.config.filters for recipient preferences
```

For **one opt-in email when batch-subscribing a user to many alerts**, prefer **one channel per user** (or alert board) with many watches and **one email subscriber** using `config.filters`, not one email subscriber per forecast channel. Authorization is per subscriber row; multiple channel subscribers with `authorization.required: true` each send a separate confirmation email. See [email-subscribers.md](email-subscribers.md#batch-subscribe-and-one-opt-in-email).

Example:

```json
{
  "subscriber_key": "foretic:job_456:board@example.com",
  "subscriber_type": "email",
  "destination_url": "board@example.com",
  "mode": "alert",
  "config": {
    "template_id": "forecast_alert_v1",
    "authorization": { "required": true },
    "filters": {
      "signal_keys": ["forecast.goal.risk"],
      "watch_group_keys": ["forecast_goal_health"],
      "band_keys": ["warning", "critical"]
    }
  }
}
```

Supported filters:

```text
signal_keys
watch_group_keys
watch_keys
band_keys
```

No filters means the subscriber receives all matching channel alerts. Filters are OR-based across dimensions: matching any listed signal, watch group, watch, or band sends the delivery. Empty arrays are ignored.

## Watch Groups

Use `watch_groups` when several watches describe one logical policy, such as forecast pace warning and critical bands. Heads Up evaluates every enabled band in the group, selects one winner, and suppresses the other matching bands for that evaluation.

Supported MVP policies:

```text
highest_severity_wins
  Default. If warning and critical both match, only critical alerts.

lowest_severity_wins
  Use when lower severity should be the customer-facing winner and higher bands are only internal guardrails.
```

The group owns cooldown by default. If a warning was sent and the value later moves into critical during the group cooldown, the critical band can still alert because it is a higher severity escalation. If critical already alerted, a later warning is suppressed until the group recovers or cooldown expires.

Alerts produced from a group still point at the winning watch, and the payload includes:

```json
{
  "watch_group_id": "wg_...",
  "band_key": "critical",
  "fields": {
    "watch_group": {
      "watch_group_key": "forecast_pace_health",
      "winner_policy": "highest_severity_wins",
      "candidate_count": 2
    }
  }
}
```

Keep using `watches` for independent policies that should be allowed to alert separately.

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

Failure details identify the section, array index, supplied stable keys, and dependency reason where available:

```json
{
  "code": "PROVISION_STEP_FAILED",
  "details": {
    "section": "watches",
    "index": 0,
    "signal_key": "missing.signal",
    "dependency": {
      "type": "signal",
      "signal_key": "missing.signal",
      "reason": "signal was not present in this provision payload and was not found in the channel"
    },
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
npm run smoke:subscriber-filters
```
