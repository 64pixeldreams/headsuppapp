# Event Payload Validation_done

## Spec Check

`SPEC_BREIF.md` requires single event and batch payload support with `idempotency_key`, `signal_key`, `occurred_at`, `value.num`, optional `fields`, and optional `cta`. `Curosr_headsupp_product_brief.md` requires event ingest to validate the event and not do aggregate/watch work inline.

## Scope

- Validate single event and `{ events: [...] }` batch payloads.
- Normalize valid payloads into an event array.
- Reject missing `signal_key`, invalid `occurred_at`, missing numeric `value.num`, invalid optional `fields`, invalid optional `cta`, empty batches, and oversized batches.

## Test Plan

- Unit tests for valid single event and batch payloads.
- Unit tests for missing required fields and invalid optional shapes.

## API Docs

- Update `docs/api/connectors-and-ingest.md`.

## Status

Done.
