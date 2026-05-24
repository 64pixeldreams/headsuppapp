# Admin API Connectors And Subscribers_done

## Spec Check

Connectors authenticate producers. Subscribers receive alerts or aggregate-forward payloads. The spec requires admin creation/listing surfaces, connector secrets, destination URL validation, and no secret leakage.

## Scope

- Add CFKit CloudFunctions `admin.createConnector` and `admin.createSubscriber`.
- Require `connector:create` and `subscriber:create` permissions.
- Generate connector secret material once.
- Validate and redact subscriber destination URLs.

## Acceptance Criteria

- Connector key is stable and unique-ready.
- Connector response can include one-time secret on creation.
- Subscriber mode supports `alert` and `aggregate_forward`.
- Subscriber response contains redacted destination URL metadata.

## API Docs

Documented in `docs/api/admin.md`.

## Test Plan

- Unit tests cover connector secret row creation and subscriber URL redaction.

## Status

Done.
