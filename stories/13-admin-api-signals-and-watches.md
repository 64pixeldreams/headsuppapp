# Admin API Signals And Watches_done

## Spec Check

Signals and signal contracts define event meaning. Watches define when aggregated signals deserve attention. Foretic should create signals explicitly when setting up a forecast watch.

## Scope

- Add CFKit CloudFunctions `admin.createSignal` and `admin.createWatch`.
- Require `signal:create` and `watch:create` permissions.
- Persist optional signal contract alongside the signal.
- Serialize watch config, escalation, and recovery JSON.

## Acceptance Criteria

- Signal creation supports explicit contract JSON.
- Watch creation supports all spec watch types by storing `watch_type` and `config_json`.
- Watch evaluation remains in the Durable Object and scheduled services.

## API Docs

Documented in `docs/api/admin.md`.

## Test Plan

- Unit tests cover signal contract persistence and watch config serialization.

## Status

Done.
