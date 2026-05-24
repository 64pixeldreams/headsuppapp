# Connector Model_done

## Spec Check

Connectors authenticate producers and map incoming events to workspace/channel ownership. The request body must not be trusted for ownership.

## Scope

- Represent connectors in D1 schema.
- Preserve connector key, secret metadata, active/enabled state, and tenant ownership fields.
- Keep connector-level HMAC as the ingest auth boundary.

## Acceptance Criteria

- Connector keys are unique.
- Ingest resolves workspace and channel from connector metadata.
- Secrets are never returned except the one-time provisioning path.

## Test Plan

- Existing HMAC, connector secret, and ingest tests cover connector behavior.

## Status

Done.
