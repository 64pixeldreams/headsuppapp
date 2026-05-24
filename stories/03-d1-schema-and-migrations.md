# D1 Schema And Migrations_done

## Spec Check

`SPEC_BREIF.md` says to create all D1 tables and uniqueness constraints before relying on application logic. Aggregates must use atomic upsert, raw dedupe must be retained for 24-72 hours, and aggregate deliveries must be unique per subscriber/signal/bucket.

## Scope

- Add `migrations/0001_headsupp_core.sql`.
- Include workspaces, channels, connectors, subscribers, signals, signal contracts, watches, watch states, aggregates, raw event dedupe, alerts, alert deliveries, and aggregate deliveries.
- Preserve spec columns and add compatibility alias columns used by existing Heads Up services.

## Acceptance Criteria

- Unique signal/channel key.
- Unique aggregate signal/bucket key.
- Unique aggregate delivery subscriber/signal/bucket key.
- Retry and cleanup indexes exist.

## Test Plan

- Unit tests cover atomic aggregate upsert SQL and dedupe cleanup SQL.
- Full `npm run check` must pass.

## Status

Done.
