# Renotify Policy: Once Until Recovered

## Scope

- Add watch config `renotify_policy`.
- Keep default behavior as `cooldown`.
- Implement `once_until_recovered`.
- Document `on_escalation_only` as a later policy, not shipped yet.

## Behavior

```text
cooldown
  Alert, then suppress repeats until cooldown_seconds expires.

once_until_recovered
  Alert once while triggered, then stay quiet until recovery is recorded.
```

## Acceptance

- Existing watch behavior is unchanged when `renotify_policy` is omitted.
- `once_until_recovered` suppresses post-cooldown repeats while `last_status = triggered`.
- `once_until_recovered` allows a new alert after recovery changes state.
- Docs and SDK examples explain how to use this for market-price/noisy threshold alerts.

## Status

Done.
