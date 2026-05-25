# 67 Contract Path Extraction_done

## User Story

As an integrator, I want signal contracts to define how values/time/cta/dimensions are extracted so events do not need hard-coded `value.num` wiring.

## Scope

- Implement contract extraction for:
  - `value_path`
  - `time_path`
  - `cta_path`
  - `dimensions`
- Keep backward compatibility with `value.num`.
- Ensure ingest/aggregation use normalized extracted values.

## Acceptance Criteria

- Events with only contract-mapped numeric values are accepted.
- Extracted timestamp and CTA are propagated into normalized event shape.
- Missing extraction data returns clear validation errors.

## Test Plan

- Unit tests for path extraction edge cases.
- Integration tests for contract-mapped ingest.
- Run `npm run check`.

## API Documentation

- Update `docs/api/connectors-and-ingest.md`.
- Update `docs/api/reference.md`.

## Done Definition

- Contract extraction active in runtime.
- Backward compatibility preserved.
- Tests green.

## Status

Done. Implemented through contract extraction runtime, fallback `value.num` support, ingest docs, reference docs, and `npm run check`.
