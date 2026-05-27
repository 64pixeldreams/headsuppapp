# Webhook Receivers And Subscriptions

Primary docs: use [quickstart.md](quickstart.md) for setup flow and [reference.md](reference.md) for canonical props. This file focuses on receiver implementation, signature verification, and retry behavior.

This guide explains how to subscribe Slack or your own webhook to a channel and what happens when a watch fires.

## What A Subscriber Does

A subscriber belongs to a channel. When Heads Up creates output for that channel, it sends the output to matching subscribers.

```text
channel -> subscriber mode -> delivery
```

Supported subscriber types:

```text
slack_webhook
webhook
```

Supported modes:

```text
alert             receives alert notifications when watches fire
aggregate_forward receives closed aggregate buckets from AGGREGATE_FORWARD watches
quiet_summary     receives scheduled proof-of-silence summaries
lifecycle           receives subscriber opt-in/opt-out lifecycle events (webhook only)
```

Slack OAuth is not part of the current API. Slack uses incoming webhook URLs created in the customer Slack workspace.

## Subscribe Slack To Alerts

Create a Slack incoming webhook URL in Slack, then create a Heads Up subscriber:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "subscriber_type": "slack_webhook",
    "destination_url": "https://hooks.slack.com/services/T_TEST/B_TEST/SECRET",
    "display_name": "#ops-alerts",
    "mode": "alert"
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "subscriber": {
      "subscriber_id": "sub_demo_slack",
      "subscriber_type": "slack_webhook",
      "display_name": "#ops-alerts",
      "mode": "alert",
      "destination_url_redacted": "https://hooks.slack.com/services/T_TEST/...",
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo"
    }
  }
}
```

Save `subscriber_id` only if you need to reference the subscriber later. The full Slack URL is never returned.

## Subscribe Your Own Webhook To Alerts

Use `subscriber_type: "webhook"` and `mode: "alert"` when your application should receive an HTTP POST when an alert fires:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "subscriber_type": "webhook",
    "destination_url": "https://example.com/headsupp/alerts",
    "display_name": "Demo alert callback",
    "mode": "alert",
    "config": {
      "signing_secret": "receiver_shared_secret"
    }
  }
}
```

If a signing secret is configured on the subscriber, outbound deliveries include verification headers. See [Receiver signing secret setup](#receiver-signing-secret-setup) below. Heads Up can also use a Worker-wide fallback with `OUTBOUND_WEBHOOK_SIGNING_SECRET` when a subscriber has no per-subscriber secret.

## Generic Alert Payload

When an alert watch fires, a generic webhook subscriber receives:

```json
{
  "type": "heads_up.alert",
  "alert_id": "alert_123",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "signal_id": "sig_demo",
  "watch_id": "watch_demo",
  "severity": "warning",
  "summary": "Demo metric high is warning at 15.",
  "current_value": 15,
  "threshold_value": 10,
  "triggered_at": "2026-05-25T16:00:00.000Z",
  "channel_metadata": {
    "user_id": "user_demo",
    "forecast_id": "forecast_coffee_2026"
  },
  "fields": {
    "source": "demo"
  },
  "cta": {
    "label": "View metric",
    "url": "https://example.com/metrics/demo"
  }
}
```

Route alert callbacks by:

```text
type = heads_up.alert
```

Dedupe retries by:

```text
alert_id
X-HeadsUp-Delivery-Id
```

## Subscribe Your App To Subscriber Lifecycle Events

Use `subscriber_type: "webhook"` and `mode: "lifecycle"` when your application should receive opt-in/opt-out callbacks for email subscribers on the same channel. This is the push alternative to polling `admin.getSubscriber` after a recipient confirms email authorization.

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "subscriber_type": "webhook",
    "destination_url": "https://example.com/headsupp/subscriber-events",
    "display_name": "Foretic lifecycle callback",
    "mode": "lifecycle",
    "config": {
      "signing_secret": "receiver_shared_secret"
    }
  }
}
```

Lifecycle subscribers do not receive alert payloads. Create a separate `mode: "alert"` webhook if you also need alert callbacks.

### Lifecycle Payload

Heads Up POSTs when a channel subscriber is authorized, disabled, or deleted:

```json
{
  "type": "heads_up.subscriber.lifecycle",
  "event": "subscriber.authorized",
  "occurred_at": "2026-05-26T12:00:00.000Z",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "subscriber_id": "sub_email_1",
  "subscriber_type": "email",
  "mode": "alert",
  "enabled": true,
  "normalized_destination": "user@example.com",
  "source_app": "foretic",
  "external_tenant_id": "user:abc",
  "external_user_id": "user:abc",
  "channel_metadata": {
    "forecast_id": "forecast_coffee_2026"
  },
  "authorization": {
    "required": true,
    "status": "authorized",
    "requested_at": "2026-05-26T11:00:00.000Z",
    "authorized_at": "2026-05-26T12:00:00.000Z"
  }
}
```

Events:

```text
subscriber.authorized  recipient confirmed email authorization (opt-in)
subscriber.disabled    subscriber disabled via API, unsubscribe, or stop-watching email action
subscriber.deleted     subscriber removed via admin.deleteSubscriber
```

Route lifecycle callbacks by:

```text
type = heads_up.subscriber.lifecycle
event = subscriber.authorized | subscriber.disabled | subscriber.deleted
```

Dedupe retries by:

```text
subscriber_id + event + occurred_at
X-HeadsUp-Delivery-Id
```

## Aggregate Forward Payload

Aggregate forwarding is not an alert. It sends one closed bucket to subscribers with `mode: "aggregate_forward"` when an `AGGREGATE_FORWARD` watch runs.

```json
{
  "source": "heads_up",
  "event_type": "aggregate_bucket_closed",
  "delivery_id": "aggdel_123",
  "dedupe_key": "sub_123:sig_123:hour:2026-05-25T15:00:00.000Z:dce0e204e",
  "signal_key": "demo.spend",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "channel_metadata": {
    "user_id": "user_demo",
    "forecast_id": "forecast_coffee_2026"
  },
  "dimensions_hash": "dce0e204e",
  "dimensions": {
    "vendor": "openai"
  },
  "bucket": {
    "type": "hour",
    "start_at": "2026-05-25T15:00:00.000Z",
    "end_at": "2026-05-25T16:00:00.000Z"
  },
  "values": {
    "sum": 42,
    "count": 1,
    "avg": 42,
    "min": 42,
    "max": 42,
    "last": 42
  }
}
```

Route aggregate callbacks by:

```text
event_type = aggregate_bucket_closed
```

Dedupe by `delivery_id` or `dedupe_key`.

## Quiet Summary Payload

Quiet summaries prove a channel was evaluated and nothing needed attention. They use `mode: "quiet_summary"` and do not create alert rows.

```json
{
  "type": "heads_up.quiet_summary",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "channel_name": "Demo Channel",
  "channel_metadata": {
    "user_id": "user_demo",
    "forecast_id": "forecast_coffee_2026"
  },
  "status": "quiet",
  "generated_at": "2026-05-25T16:00:00.000Z",
  "watches": [
    {
      "watch_id": "watch_123",
      "name": "Demo metric high",
      "watch_type": "LAST_VALUE_GT",
      "last_status": "quiet",
      "last_evaluated_at": "2026-05-25T15:58:00.000Z",
      "last_alert_at": null,
      "cooldown_until": null
    }
  ]
}
```

## Receiver Signing Secret Setup

Heads Up does **not** generate or issue webhook signing secrets. **Your application generates the secret** and configures the **same value in two places**:

```text
1. Your webhook receiver app   -> verify inbound POSTs (e.g. HEADSUPP_RECEIVER_SIGNING_SECRET)
2. Heads Up subscriber config  -> sign outbound POSTs (config.signing_secret on createSubscriber)
```

This is a shared HMAC key between your receiver and Heads Up. It is unrelated to `HEADSUPP_API_KEY` (control-plane auth) and unrelated to connector ingest secrets (`hu_sec_...`).

### Generate a secret

Use a long random string. Example:

```bash
openssl rand -hex 32
```

Store it in your secrets manager or deployment config. Do not commit it to git.

### Configure your receiver app

Your HTTP handler verifies `X-HeadsUp-Signature` using this secret. Name the env var whatever fits your stack; SDK examples use `HEADSUPP_RECEIVER_SIGNING_SECRET`.

Cloudflare Workers example:

```bash
wrangler secret put HEADSUPP_RECEIVER_SIGNING_SECRET
```

Paste the generated value when prompted.

### Configure Heads Up when creating the subscriber

Pass the **same secret** in `config.signing_secret` for each webhook subscriber (`mode: alert`, `lifecycle`, or `aggregate_forward`):

```js
await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://your-app.example/headsupp/alerts',
  mode: 'alert',
  config: {
    signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET,
  },
});
```

Raw API equivalent:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "subscriber_type": "webhook",
    "destination_url": "https://your-app.example/headsupp/alerts",
    "mode": "alert",
    "config": {
      "signing_secret": "<same secret as your receiver app>"
    }
  }
}
```

Heads Up stores the secret on the subscriber row and uses it when signing deliveries to that destination. The secret is **not** returned in API read responses.

### One secret per environment (typical)

Use separate secrets per deployment environment, not per developer:

```text
dev     -> one dev secret shared by all developers on the dev stack
staging -> one staging secret
prod    -> one prod secret
```

Each environment needs:

- the receiver app secret (e.g. `wrangler secret put` on the Workers service that handles callbacks), and
- the same value in `config.signing_secret` when provisioning webhook subscribers against that environment's Heads Up API.

Developers on the same dev environment reuse the same dev secret. You only need per-developer secrets if each developer runs an isolated receiver URL **and** provisions separate Heads Up test channels pointing at that URL.

### Per-subscriber secrets (advanced)

You may use a different `signing_secret` per webhook subscriber if your app stores and selects the matching secret when verifying (for example one secret per customer channel). The simple integration pattern is one secret per environment shared across all webhook subscribers in that environment.

### Optional Worker fallback

If `config.signing_secret` is omitted on a subscriber, Heads Up falls back to the Worker env var `OUTBOUND_WEBHOOK_SIGNING_SECRET`. Prefer per-subscriber secrets in production so alert, lifecycle, and aggregate callbacks can use distinct keys when needed.

## Verify Outbound Signatures

Signed webhook deliveries include:

```text
X-HeadsUp-Timestamp: <unix seconds>
X-HeadsUp-Signature: v1=<hmac_sha256_hex(timestamp + "." + raw_body)>
X-HeadsUp-Delivery-Id: <delivery id>
```

Node verification example:

```js
import crypto from 'node:crypto';

export function verifyHeadsUpWebhook({ rawBody, timestamp, signature, secret }) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const provided = signature.replace(/^v1=/, '');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
```

Reject requests with missing headers, invalid signatures, or stale timestamps. Store `X-HeadsUp-Delivery-Id` or the payload dedupe key so retries are idempotent.

## Response Codes And Retry

Heads Up classifies receiver responses as:

```text
2xx => sent
429, 5xx, network error => retrying
400, 401, 403, 404 => failed
```

Retry backoff:

```text
attempt 1: immediate
attempt 2: +1 minute
attempt 3: +5 minutes
attempt 4: +15 minutes
attempt 5: +1 hour
attempt 6: +6 hours
then failed
```

Return `2xx` only after your receiver has stored or safely ignored the delivery.

## SDK Subscriber Examples

Slack alert subscriber:

```js
await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'slack_webhook',
  destination_url: process.env.SLACK_WEBHOOK_URL,
  display_name: '#ops-alerts',
  mode: 'alert',
});
```

Generic alert callback:

```js
await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://example.com/headsupp/alerts',
  display_name: 'Alert callback',
  mode: 'alert',
  config: {
    signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET,
  },
});
```

Aggregate-forward callback:

```js
const aggregateSubscriber = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://example.com/headsupp/aggregates',
  display_name: 'Aggregate callback',
  mode: 'aggregate_forward',
});
```

## Related Guides

- [subscribers.md](subscribers.md) for subscriber API reference.
- [aggregate-forwarding.md](aggregate-forwarding.md) for closed-bucket forwarding.
- [watch-types.md](watch-types.md) for choosing the right watch.
- [quickstart.md](quickstart.md) for the full create-and-send flow.
