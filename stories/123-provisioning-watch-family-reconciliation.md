# Provisioning Watch Family Reconciliation

Status: implemented.

Implemented in:

- `apps/headsupp-api/src/services/admin/provision-channel.js`
- `apps/headsupp-api/test/unit/admin-control-plane.test.js`
- `docs/api/reference.md`
- `docs/api/watch-types.md`
- `docs/public-sdk/cookbook/noise-control.md`

## User Story

As a Heads Up integrator, I want provisioning to reconcile old watch rules when a newer grouped policy replaces them, so migrations cannot leave legacy watches active and cause duplicate customer emails.

## Why This Matters

Heads Up's product promise is not "send every configured thing." It is to turn noisy app events and rules into meaningful attention. The May 29 Foretic incident exposed a migration failure mode:

```text
same channel + same signal + same forecast/resource
legacy ungrouped pace:warning
legacy ungrouped pace:critical
new grouped forecast_pace_health warning/critical
```

The grouped policy did the right thing internally, but old ungrouped watches still fired next to it. A bad or stale integrator configuration should not become customer noise.

## Product Fit

This is control-plane hygiene, not a new alert feature. The provisioning layer already knows when it is creating grouped policies. It should also know which older watch family they replace.

## Scope

- Extend `admin.provisionChannel` watch-group handling with optional replacement metadata.
- When a grouped policy is provisioned, disable older active ungrouped watches in the same watch family for the same `workspace_id`, `channel_id`, and `signal_id`.
- Minimum supported v1 replacement metadata:

```json
{
  "watch_groups": [
    {
      "group_key": "forecast_pace_health",
      "signal_key": "forecast.revenue.pace",
      "replaces": {
        "watch_key_prefixes": ["pace:warning", "pace:critical"],
        "watch_id_patterns": [":pace:warning", ":pace:critical"]
      },
      "bands": []
    }
  ]
}
```

- If no `replaces` metadata is provided, do not infer broad replacements except for established Heads Up-owned templates where the mapping is explicit in code/docs.
- Use durable disable (`enabled = 0`) instead of hard delete.
- Return reconciliation counts in `admin.provisionChannel` response, e.g. `reconciled.disabled_watches`.
- Audit reconciliation as part of the provisioning action.

## Out Of Scope

- Deleting historical alerts/deliveries.
- Arbitrary rule conflict solving.
- Foretic-only endpoint names.
- Delivery-time duplicate suppression (story 124).

## Acceptance Criteria

- Provisioning a grouped policy with `replaces` disables matching older ungrouped active watches for the same signal/channel.
- It does not disable unrelated watches, different signals, different channels, different tenants, or positive/info "ahead" watches unless explicitly listed.
- Re-running provisioning is idempotent: already-disabled watches are not counted as newly disabled.
- The correct grouped watch remains active and continues to evaluate.
- Response includes a reconciliation summary.
- Cross-tenant boundaries are preserved.

## Test Plan

- Unit test: legacy ungrouped warning/critical + new grouped policy results in old rows disabled and grouped rows active.
- Unit test: unrelated watches and tenants are not disabled.
- Unit test: rerun returns `disabled_watches = 0`.
- Smoke test: provision old shape, provision new grouped shape, send one triggering event, assert one alert/delivery.
- Run `npm run check` from `apps/headsupp-api`.

## Docs

- Update `docs/api/provisioning.md` and `docs/api/reference.md` with `watch_groups[].replaces`.
- Update `docs/api/watch-types.md` noise-control guidance: grouped policies replace legacy ungrouped bands.
- Update SDK docs/examples if `provisionChannel` examples include grouped policies.

## Done Definition

- Provisioning can safely migrate from ungrouped bands to grouped policies without duplicate emails.
- Tests and smoke prove cleanup and idempotency.
- API docs explain how integrators should declare replacement relationships.
