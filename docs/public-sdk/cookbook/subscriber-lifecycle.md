# Cookbook: Subscriber Lifecycle

Disable or remove subscribers without raw HTTP envelopes.

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

Recipients can also unsubscribe via signed links in email footers (`GET /v1/subscribers/unsubscribe?token=...` on the API host). That path disables the subscriber without your app calling the SDK.

## What you should see

- Disabled: no further deliveries; row remains
- Deleted: subscriber row removed
- Idempotent disable on already-disabled subscriber: `changed: false`
