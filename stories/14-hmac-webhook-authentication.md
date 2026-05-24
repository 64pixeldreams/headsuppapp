# HMAC Webhook Authentication_done

## Spec Check

Event ingest must authenticate at the connector level with HMAC and must not trust request-body ownership fields. The ingest request must validate/authenticate, enqueue, and return `202 Accepted`.

## Scope

- Connector HMAC signing and verification helpers.
- Timestamp skew validation.
- Constant-time signature comparison.
- Worker ingest route uses connector metadata from control-plane storage.

## Acceptance Criteria

- Missing, stale, invalid, and disabled connectors are rejected.
- Valid signatures authenticate and continue to queueing.
- Ownership comes from connector metadata.

## API Docs

Documented in `docs/api/authentication.md` and `docs/api/connectors-and-ingest.md`.

## Test Plan

- Existing connector HMAC and ingest integration tests cover this behavior.

## Status

Done.
