# Cookbook: Subscriber Lifecycle

Read subscriber state, receive opt-in/opt-out webhooks, disable, or delete subscribers without raw HTTP envelopes.

## Read status after email confirmation

Email subscribers with `authorization.required = true` start disabled until the recipient confirms. Poll status with `getSubscriber`:

```js
const pending = await headsup.getSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_id: emailSubscriber.subscriber_id,
});

// pending.enabled === 0
// pending.config.authorization.status === 'pending'
```

After the recipient clicks the confirmation link (`GET /v1/subscribers/confirm?token=...` on the API host), read again:

```js
const active = await headsup.getSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_id: emailSubscriber.subscriber_id,
});

// active.enabled === 1
// active.config.authorization.status === 'authorized'
```

Lookup by email when you did not persist `subscriber_id`:

```js
await headsup.getSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  email: 'user@example.com',
  mode: 'alert',
});
```

List all subscribers on a channel:

```js
const subscribers = await headsup.listSubscribers({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
});
```

## Push opt-in/opt-out callbacks (recommended for app UI)

Polling works, but a lifecycle webhook avoids stale UI after confirmation. Create a **separate** webhook subscriber with `mode: 'lifecycle'` on the same channel:

```js
await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://your-app.example/headsupp/subscriber-events',
  display_name: 'Subscriber lifecycle callback',
  mode: 'lifecycle',
  config: { signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET },
});
```

Heads Up POSTs `heads_up.subscriber.lifecycle` payloads when:

```text
subscriber.authorized  recipient confirmed email opt-in
subscriber.disabled    disabled via API, unsubscribe link, or stop-watching email action
subscriber.deleted     removed via deleteSubscriber
```

Route on `event` and match your email subscriber with `subscriber_id` or `normalized_destination`. Full payload reference: [webhook-receivers.md](../webhook-receivers.md).

Typical Foretic channel setup:

```text
email subscriber (mode: alert)           -> delivers alerts to the user inbox
lifecycle webhook (mode: lifecycle)    -> updates Foretic UI on confirm/opt-out
alert webhook (mode: alert, optional)  -> receives alert payloads in your app
```

## Disable by subscriber id

```js
const updated = await headsup.disableSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_id: emailSubscriber.subscriber_id,
});
// updated.enabled === 0
```

## Disable by email

```js
await headsup.disableSubscriberByEmail({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  email: 'martin@example.com',
  mode: 'alert',
});
```

Same as `disableSubscriber` with `email` + `mode` in the payload.

If multiple subscribers match the same email, the API returns `AMBIGUOUS_SUBSCRIBER_MATCH`; pass `subscriber_id` or disambiguate with `mode`.

## Delete

```js
await headsup.deleteSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_id: emailSubscriber.subscriber_id,
});
```

## Email unsubscribe (recipient-facing)

Recipients can also unsubscribe via signed links in email footers (`GET /v1/subscribers/unsubscribe?token=...` on the API host). That path disables the subscriber and fires `subscriber.disabled` to lifecycle webhooks when configured.

## What you should see

- Pending authorization: `enabled = 0`, `authorization.status = pending`
- Confirmed: `enabled = 1`, `authorization.status = authorized`, optional `subscriber.authorized` lifecycle webhook
- Disabled: no further deliveries; row remains; optional `subscriber.disabled` lifecycle webhook
- Deleted: subscriber row removed; optional `subscriber.deleted` lifecycle webhook
- Idempotent disable on already-disabled subscriber: `changed: false`
