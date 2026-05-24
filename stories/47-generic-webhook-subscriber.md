# Generic Webhook Subscriber_done

## User Story

As a developer, I want to create a generic webhook subscriber, so Foretic callbacks or third-party systems can receive alerts and aggregate outputs.

## Scope

- Support `subscriber_type = "webhook"`.
- Accept valid HTTPS destination URLs.
- Support `mode = "alert"` and `mode = "aggregate_forward"`.
- Reuse tenant and workspace/channel ownership checks.
- Return redacted destination URLs.

## Out Of Scope

- Dispatching webhook deliveries.
- Signing outbound webhook payloads.
- Retry logic.
- Webhook secret rotation.

## Acceptance Criteria

- Given a valid HTTPS webhook URL, generic webhook subscriber creation succeeds.
- Given `mode = alert`, subscriber creation succeeds.
- Given `mode = aggregate_forward`, subscriber creation succeeds.
- Given an invalid mode, subscriber creation fails.
- Given a cross-tenant or cross-workspace channel, subscriber creation fails.

## Test Plan

- Unit test generic webhook creation.
- Unit test aggregate-forward mode.
- Unit test invalid mode rejection.
- Unit test non-HTTPS rejection.
- Unit test tenant/workspace ownership rejection.
- Run `npm test`.

## API Documentation

- Update `docs/api/subscribers.md`.

## Implementation Notes

- Use fake URLs in tests.
- Keep webhook dispatch for later delivery stories.

## Done Definition

- Code implemented.
- Tests added.
- API docs updated.
- `npm test` passes.
- No unrelated changes.

## Status

Done.
