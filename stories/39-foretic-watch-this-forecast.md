# Foretic Watch This Forecast_done

## Spec Check

`SPEC_BREIF.md` says Foretic should replace or extend Subscribe with "Watch this forecast". That action creates a Heads Up channel, webhook connector, signal contracts, watches, and subscribers. Heads Up should not know Foretic forecasting internals; it only stores structured signal/watch configuration.

## Scope

- Provide a stable summary for the `foretic.createForecastWatch` provisioning result.
- Confirm the setup includes channel, connector, signal contract, warning/critical/recovery watches, and alert/aggregate subscribers.
- Keep the connector secret one-time only.

## Acceptance Criteria

- Foretic can call one CloudFunction to provision all resources for a forecast.
- Response includes `event_url`, `connector_key`, and one-time `connector_secret` only when created.
- Response includes enough ids and watch/subscriber summaries for Foretic to save its integration state.

## Test Plan

- Unit test summary shape for a full forecast watch setup.
- Existing provisioning tests continue to cover idempotency and URL validation.

## Status

Done.
