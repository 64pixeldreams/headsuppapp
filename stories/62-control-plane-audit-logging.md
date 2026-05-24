# Control Plane Audit Logging_done

## User Story

As an operator, I want audit logs for sensitive control-plane actions, so API key creation, rotation, revocation, and resource provisioning can be investigated without exposing secrets.

## Product Fit

Heads Up is API-first and Cloudflare-native. Audit logging belongs on the low-volume CFKit control plane, not the high-volume event ingest path.

## Scope

- Add a D1 audit log table or use an existing appropriate table if one exists.
- Record sensitive control-plane actions:
  - API key created;
  - API key rotated;
  - API key revoked;
  - workspace/channel/connector/signal/watch/subscriber created;
  - failed authorization attempts where practical.
- Include safe metadata:
  - actor key id or user id;
  - action name;
  - target resource type/id;
  - source app;
  - external tenant id;
  - workspace id;
  - request id;
  - timestamp;
  - success/failure.
- Exclude raw API keys, connector secrets, Slack/webhook URLs, and raw event payloads.
- Add a safe read endpoint/action for recent audit entries if useful for operators.

## Out Of Scope

- Full SIEM integration.
- Long-term log archival policy.
- Raw ingest event logging.

## Acceptance Criteria

- Sensitive admin actions write audit rows.
- Audit rows contain enough context to investigate tenant and permission issues.
- Audit rows do not contain secrets or destination URLs.
- Failed auth attempts are captured where the code path has safe actor/request context.
- Tests verify secret fields are not persisted.

## Test Plan

- Unit tests for audit row building and redaction.
- Integration tests for successful and failed control-plane actions.
- Schema/migration test if a new table is added.
- Run `npm run check`.
- Secret scan.

## API Documentation

- Update `docs/api/authentication.md`.
- Update `docs/api/admin.md`.
- Update `docs/api/reference.md`.
- Update `docs/api/schema-and-migrations.md` if schema changes.

## Implementation Notes

- Keep audit writes out of the hot ingest path.
- If an audit write fails, decide explicitly whether the control-plane action should fail or log-and-continue. Prefer failing closed for API key lifecycle actions.
- Redact destination URLs before logging.

## Done Definition

- Audit logging implemented and tested for sensitive control-plane actions.
- Docs updated.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
