# Subscriber Dimension Filters

Status: implemented.

Implemented in:

- `apps/headsupp-api/src/services/subscribers/alert-filters.js`
- `apps/headsupp-api/src/services/alerts/persistence.js` (`loadAlertRoutingContext` exposes `fields`)
- `apps/headsupp-api/test/unit/subscriber-alert-filters.test.js`
- `apps/headsupp-api/test/unit/alert-persistence.test.js`
- `apps/headsupp-api/scripts/subscriber-dimension-filters-smoke.mjs`
- `docs/api/subscribers.md`, `docs/api/reference.md`, `docs/api/smoke-test-suite.md`, `docs/public-sdk/cookbook/email-alerts.md`

## User Story

As a SaaS integrator running one shared alert-board channel per user, I want a subscriber to scope which alerts they receive by event dimension (for example `forecast_id`), so one recipient on a shared channel can say "only goal-risk on forecast X" without a separate channel per resource.

## Why This Matters

Heads Up already supports `config.filters` on `mode = alert` subscribers, but only by alert *type*:

```text
signal_keys
watch_group_keys
watch_keys
band_keys
```

These are combined with OR semantics ("does this subscriber care about this alert type?"). They cannot scope by the resource the alert is about. Foretic's open integration question (Q2) is exactly this: on one channel-per-user carrying many forecasts, a recipient needs per-forecast preferences. Without dimension scoping, integrators are forced back into one-channel-per-resource and multiple opt-in emails.

This story closes the future extension already noted in story 121.

## Product Fit

This is a routing refinement on the existing delivery path:

```text
alert -> loadAlertSubscribers -> subscriberMatchesAlertFilters -> deliveries
```

It is not a dashboard, query language, or Foretic-only path. The dimension keys are generic (`forecast_id`, `region`, `team_id`, ...).

## Filter Shape

Add a `dimensions` object to `config.filters`. Keys are dimension/field names; values are allow-lists of strings. `fields` is accepted as an alias for `dimensions` (the shape documented in story 121).

```json
{
  "config": {
    "filters": {
      "signal_keys": ["forecast.goal.risk"],
      "dimensions": {
        "forecast_id": ["forecast_123", "forecast_999"]
      }
    }
  }
}
```

## Matching Semantics

The existing type filters keep OR semantics. The new `dimensions` filter is an AND scope layered on top:

```text
receives = typeMatch AND dimensionMatch

typeMatch:
  - true if no type filters set
  - else OR across signal_keys / watch_group_keys / watch_keys / band_keys (unchanged)

dimensionMatch:
  - true if no dimensions set
  - else AND across each configured dimension key
  - within one key, OR across its allowed values
  - the alert's value for a key is read from the alert payload fields (e.g. fields.forecast_id)
  - a configured dimension whose value is absent on the alert does NOT match
```

Worked example: `signal_keys: ["forecast.goal.risk"]` + `dimensions: { forecast_id: ["X"] }` delivers only goal-risk alerts about forecast X.

This is backward compatible:

- subscribers with no `dimensions` behave exactly as today;
- subscribers with only `dimensions` (no type filters) match any alert type for the listed dimension values;
- subscribers with no filters at all still receive everything.

## Scope

- Extend `normalizeSubscriberAlertFilters` to validate and normalize `dimensions` (object of string -> string[]); accept `fields` as an alias.
- Extend `subscriberMatchesAlertFilters` to apply `typeMatch AND dimensionMatch`.
- Expose alert dimension values to routing by adding `fields` to `loadAlertRoutingContext`.
- Keep `sanitizeSubscriberConfig` passing `filters` through on read APIs (already does).

## Out Of Scope

- Numeric/range or negation operators (only equality allow-lists in v1).
- Nested boolean filter expressions.
- New subscriber storage columns (filters stay in `config_json`).
- Frontend/portal UI.

## Acceptance Criteria

- A subscriber with `dimensions.forecast_id: ["X"]` receives alerts whose `fields.forecast_id` is `X` and not those for other forecasts.
- Combining `signal_keys` with `dimensions` yields AND scoping (type AND dimension).
- A subscriber with no `dimensions` is unaffected (existing OR behavior preserved).
- An alert missing the configured dimension value is not delivered to a dimension-scoped subscriber.
- `fields` is accepted as an alias for `dimensions`.
- Invalid `dimensions` shapes return `INVALID_SUBSCRIBER_FILTERS`.

## Test Plan

- Unit tests in `subscriber-alert-filters.test.js` for normalize (valid, alias, invalid) and match (type AND dimension, dimension-only, missing value, OR within values).
- Unit test in `alert-persistence.test.js` (or routing context test) proving `loadAlertRoutingContext` exposes `fields`.
- Deployed smoke `smoke:subscriber-dimension-filters`: one channel, two forecasts, two dimension-scoped subscribers; assert each receives only its forecast's alert.
- Run `npm run check`.

## API And SDK Docs

- `docs/api/subscribers.md` (Alert Filters section: add dimensions, semantics, example).
- `docs/api/reference.md` (filters shape).
- `docs/api/smoke-test-suite.md` (new smoke).
- `docs/public-sdk/cookbook/email-alerts.md` (per-recipient dimension preferences example).
- `docs/public-sdk/concepts/*` subscriber/filters guidance if present.

## Implementation Notes

- Files:
  - `apps/headsupp-api/src/services/subscribers/alert-filters.js`
  - `apps/headsupp-api/src/services/alerts/persistence.js` (`loadAlertRoutingContext`)
  - `apps/headsupp-api/scripts/subscriber-dimension-filters-smoke.mjs`
- Read dimension values from the alert payload `fields` using a dot-path lookup so nested keys work.
- No migration required.

## Done Definition

- Dimension filters implemented with AND-scope semantics and backward compatibility.
- Unit tests and a deployed smoke pass.
- API and SDK docs updated.
- `npm run check` passes.
