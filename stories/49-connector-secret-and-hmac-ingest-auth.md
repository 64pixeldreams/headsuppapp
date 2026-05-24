# Connector Secret And HMAC Ingest Auth_done

## User Story

As an event producer, I want each webhook connector to have a secret and HMAC verification, so only authorized systems can send events into a Heads Up channel.

## Scope

- Generate webhook connector secrets during connector creation.
- Return connector secrets only once.
- Add HMAC signing and verification helpers.
- Verify `X-HeadsUp-Timestamp` and `X-HeadsUp-Signature`.
- Reject disabled connectors.
- Reject stale timestamps outside the five-minute skew window.
- Use constant-time signature comparison.
- Wire `/v1/events/{connector_key}` through connector lookup and HMAC auth.

## Out Of Scope

- Raw event queue writes.
- Event schema validation beyond reading the raw body.
- Batch ingest.
- Dedupe and aggregation.

## Acceptance Criteria

- Given a connector secret, the helper generates `sha256=<signature>`.
- Given a valid timestamp/signature/body, verification succeeds.
- Given a stale timestamp, verification fails.
- Given an invalid signature, verification fails.
- Given a disabled connector, verification fails.
- Given a valid request to `/v1/events/{connector_key}`, auth succeeds and returns an auth-ready response.

## Test Plan

- Unit test signing.
- Unit test valid verification.
- Unit test stale timestamp rejection.
- Unit test invalid signature rejection.
- Unit test disabled connector rejection.
- Integration test ingest route HMAC verification.
- Run `npm test`.

## API Documentation

- Update `docs/api/connectors-and-ingest.md`.

## Implementation Notes

- Signature payload is `timestamp + "." + raw_body`.
- Use Web Crypto APIs so the same code runs in Cloudflare Workers and tests.
- Do not log connector secrets.

## Done Definition

- Code implemented.
- Tests added.
- API docs updated.
- `npm test` passes.
- No unrelated changes.

## Status

Done.
