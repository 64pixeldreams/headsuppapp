# SaaS Integration Guide

This is the recommended path for SaaS apps that want Heads Up to own alert evaluation and delivery while the SaaS app owns its product UI.

Use this guide before lower-level reference docs.

## Recommended Model

```text
workspace
  one per SaaS tenant, account, or user boundary

channel
  one per alert board/user/account when one recipient set should cover many resources
  one per resource only when consent, subscribers, lifecycle, or cooldowns must be isolated

connector
  one signed ingest endpoint per channel

signals
  shared semantic keys such as forecast.pace.percent

events
  include resource IDs in fields and dimensions, for example forecast_id

watches/watch_groups
  one policy per alert rule; use watch_groups for warning/critical bands

subscribers
  one email subscriber per recipient; use config.filters for alert preferences
```

For Foretic-style alert boards, prefer one channel per board and shared signal keys with `fields.forecast_id` / `dimensions.forecast_id`. Keep per-forecast policies as separate watches or watch groups so cooldowns remain per policy. Use one channel per forecast only when each forecast needs separate consent or a separate subscriber list.

## Channel Decision Tree

Use one channel per resource when:

- each resource needs separate email consent;
- each resource has a different recipient list;
- deleting the resource should disable every related alert artifact;
- duplicate opt-in emails are acceptable.

Use one channel per alert board when:

- one opt-in should cover many resources;
- recipients choose alert types through `config.filters`;
- one workspace callback should receive alerts for many resources;
- resources share the same ingest connector and lifecycle.

## One-Call Provisioning

Use `admin.provisionChannel` or the SDK `provisionChannel()` wrapper.

```json
{
  "workspace": {
    "workspace_key": "foretic:user:123",
    "name": "Foretic user 123",
    "source_app": "foretic",
    "external_tenant_id": "user:123",
    "external_user_id": "user:123"
  },
  "channel": {
    "channel_key": "foretic:user:123:board:default",
    "name": "Forecast alert board",
    "purpose": "forecast_alert_board",
    "metadata": {
      "board_id": "default"
    }
  },
  "connector": {
    "connector_key": "ck_foretic_user_123_board_default"
  },
  "signals": [
    {
      "signal_key": "forecast.pace.percent",
      "value_mode": "last",
      "contract": {
        "dimensions": ["forecast_id"],
        "default_bucket_types": ["minute"]
      }
    }
  ],
  "watch_groups": [
    {
      "group_key": "forecast_fc_123_pace_health",
      "signal_key": "forecast.pace.percent",
      "winner_policy": "highest_severity_wins",
      "cooldown_seconds": 3600,
      "bands": [
        {
          "band_key": "warning",
          "severity": "warning",
          "watch_type": "LAST_VALUE_LT",
          "config": {
            "threshold": 85,
            "bucket_type": "minute",
            "filters": {
              "forecast_id": "fc_123"
            }
          }
        },
        {
          "band_key": "critical",
          "severity": "critical",
          "watch_type": "LAST_VALUE_LT",
          "config": {
            "threshold": 70,
            "bucket_type": "minute",
            "filters": {
              "forecast_id": "fc_123"
            }
          }
        }
      ]
    }
  ],
  "subscribers": [
    {
      "subscriber_key": "foretic:user:123:board:default:email:ops@example.com",
      "subscriber_type": "email",
      "destination_url": "ops@example.com",
      "mode": "alert",
      "config": {
        "template_id": "forecast_alert_v1",
        "filters": {
          "watch_group_keys": ["forecast_fc_123_pace_health"],
          "band_keys": ["warning", "critical"]
        }
      }
    }
  ],
  "workspace_subscribers": [
    {
      "subscriber_type": "webhook",
      "destination_url": "https://api.example.com/heads-up/alerts",
      "mode": "alert",
      "config": {
        "signing_secret": "receiver-secret"
      }
    }
  ]
}
```

Save:

- `workspace_id`;
- `channel_id`;
- `connector_key`;
- one-time `connector_secret`;
- stable `subscriber_key`, `watch_key`, and `group_key` values.

## Subscriber Updates

`subscriber_key` is the stable identity for repeat provisioning. `admin.provisionChannel` reruns with the same `subscriber_key` update mutable subscriber fields such as `name`, `mode`, `enabled`, and `config`, including `config.filters`.

Updating filters does not change the email destination, does not reset authorization, and does not send a new opt-in email. Changing an email destination should be treated as a new subscriber or an explicit reauthorization flow.

## Signatures

Signed ingest uses:

```text
X-HeadsUp-Signature: sha256=<hex_hmac>
```

Outbound webhook callbacks use:

```text
X-HeadsUp-Signature: v1=<hex_hmac>
```

These prefixes are intentionally different because the directions are different. Keep separate verifier helpers and always verify the raw request body.

## Debugging A Queued Event

If ingest returns `queued: 1` but no email arrives, call `admin.traceEvent` with the original `idempotency_key`:

```json
{
  "workspace_id": "ws_...",
  "channel_id": "ch_...",
  "idempotency_key": "foretic:test:123"
}
```

The trace reports raw event status, aggregate application, recent watch states, alerts, deliveries, subscriber filter matches, and cooldown suppression. It redacts destinations and secrets.

Manual test checklist:

- use a fresh `idempotency_key`;
- set `occurred_at` to now;
- send a value that crosses the threshold;
- wait up to one minute for queue and email delivery;
- use a new channel or `cooldown_seconds: 0` for repeated tests;
- use `admin.traceEvent` when the event is queued but no delivery is created.

Family coverage checks (critical for multi-signal integrations):

- confirm the channel has a `signals` row and an enabled watch/watch_group band for each emitted `signal_key`;
- if only one family (for example pace) fires, verify other families were actually provisioned as signals+watches on the same channel;
- if `trace.summary.accepted = true` but `raw_event.status = failed` and no signal/alerts are present, the event failed before watch evaluation and needs platform troubleshooting;
- include `idempotency_key`, `signal_key`, `workspace_id`, and `channel_id` in escalation tickets so processing can be traced precisely.

## Migration

When moving from older one-resource channels to alert-board channels, do it in phases:

1. Provision the new board channel with new stable keys.
2. Add recipients using the same email addresses and desired filters.
3. Confirm authorization state before disabling old subscribers.
4. Disable old independent watches before enabling equivalent watch groups.
5. Send a test event and verify with `admin.traceEvent`.
6. Keep old connector keys active until producers have switched.

See [migration-and-cleanup.md](migration-and-cleanup.md) for details.
