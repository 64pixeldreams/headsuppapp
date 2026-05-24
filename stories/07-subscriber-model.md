# Subscriber Model_done

## Spec Check

Subscribers receive alerts or aggregate-forward payloads. MVP subscriber types are Slack webhook and generic webhook; email is out of scope.

## Scope

- Represent subscribers in D1 schema.
- Preserve mode: `alert` or `aggregate_forward`.
- Validate and redact destination URLs.

## Acceptance Criteria

- Subscribers are workspace/channel scoped.
- Slack and generic webhook URL validation exists.
- Real webhook URLs are not exposed in public responses.

## Test Plan

- Existing Slack and generic webhook subscriber unit tests verify validation, ownership, idempotency, and redaction.

## Status

Done.
