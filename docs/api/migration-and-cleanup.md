# Migration And Cleanup

Use this guide when an integration changes shape, for example moving from one channel per resource to one channel per alert board, or from independent warning/critical watches to grouped watch policies.

## Goals

- Avoid duplicate emails.
- Preserve email authorization whenever possible.
- Keep connector rollout reversible.
- Leave enough delivery history for support.

## Independent Watches To Watch Groups

1. Provision the new `watch_groups` with stable `group_key` and `band_key` values.
2. Keep `cooldown_seconds` equal to or stricter than the old watches.
3. Send one test event that would previously trigger both warning and critical.
4. Confirm only the winner alert creates a delivery.
5. Disable the old independent watches with the watch lifecycle/control API.
6. Use `admin.traceEvent` to verify repeat events are suppressed by cooldown instead of duplicated.

## Resource Channels To Alert-Board Channel

1. Create the board channel with a stable `channel_key`.
2. Use shared semantic signal keys and include the resource id in event fields/dimensions.
3. Create one watch or watch group per resource policy.
4. Recreate recipients on the board channel with stable `subscriber_key` values and `config.filters`.
5. Preserve authorization by reusing the same destination only when the API allows config/filter updates without destination change.
6. Switch producers to the new connector key.
7. Disable old watches before disabling old subscribers.

## Subscriber Cleanup

Do not delete subscribers first. Disable or update them first so delivery history remains explainable.

Safe order:

```text
disable old watches
verify no new alerts on old channel
disable old subscribers
switch connector/event producer
optionally delete obsolete subscribers after retention period
```

Changing an email destination is a new recipient and should require a new authorization flow when authorization is enabled. Updating `config.filters` for the same `subscriber_key` should preserve authorization and should not send another opt-in email.

## Connector Cleanup

Keep old connector keys active during producer rollout. Once producers have switched:

1. send a final test event to the old connector and verify it is intentionally rejected or ignored;
2. disable old watches/subscribers;
3. rotate or disable the old connector;
4. keep the old channel rows for audit unless storage cleanup is required.

## Debug Checklist

For any event that returns `queued` but does not notify:

```text
admin.traceEvent(workspace_id, channel_id, idempotency_key)
```

Check:

- raw event status;
- aggregate applied timestamp;
- watch state and cooldown;
- alert row creation;
- subscriber filter matches;
- delivery status and retry state.
