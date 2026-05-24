# Foretic Forecast State Emission_done

## Spec Check

Foretic emits structured state events such as `forecast_state` to Heads Up. Heads Up must authenticate, validate, enqueue, aggregate, and evaluate without Foretic owning notification logic.

## Scope

- Build Foretic `forecast_state` event payloads using the existing signal contract.
- Build signed ingest request metadata using connector HMAC.
- Keep request ownership bound to connector metadata, not event body fields.

## Acceptance Criteria

- Event includes `forecast_id`, `forecast_name`, `pace_percent`, `status`, numeric `value.num`, and CTA back to Foretic.
- Signed request includes `X-HeadsUp-Timestamp` and `X-HeadsUp-Signature`.
- Event validates through the existing ingest validator.

## Test Plan

- Unit test forecast state event shape.
- Unit test signed request verifies with connector HMAC.
- Unit test normalized ingest payload accepts generated event.

## Status

Done.
