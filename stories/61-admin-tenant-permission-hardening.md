# Admin Tenant Permission Hardening_done

## User Story

As a platform owner, I want every admin read/write to enforce tenant and permission boundaries, so one service key cannot accidentally create or mutate resources in the wrong workspace or tenant.

## Product Fit

The spec requires tenant isolation by `source_app`, `external_tenant_id`, `external_user_id`, and `workspace_id`. This story makes that rule explicit across the control-plane API.

## Scope

- Audit all current `admin.create*` and helper actions for ownership checks.
- Add shared guard helpers for:
  - workspace ownership;
  - channel belongs to workspace;
  - signal belongs to channel/workspace;
  - watch belongs to channel/workspace/signal;
  - subscriber belongs to channel/workspace.
- Enforce permission checks before D1/KV writes.
- Add negative tests for cross-workspace and cross-tenant attempts.
- Ensure returned errors are safe and actionable.

## Out Of Scope

- UI-level authorization.
- Multi-account Cloudflare isolation.
- Foretic code changes.

## Acceptance Criteria

- Admin API rejects mismatched `workspace_id`, `channel_id`, `source_app`, and `external_tenant_id` combinations.
- Connector creation cannot bind to a channel outside the caller's allowed workspace.
- Subscriber creation cannot bind to another tenant's channel.
- Signal and watch creation cannot cross workspace/channel boundaries.
- Tests prove two tenants can use the same names/signal keys without admin data leakage.

## Test Plan

- Unit tests for shared guard helpers.
- Integration tests for each protected admin action.
- Negative tests for tenant mismatch, workspace mismatch, and missing permission.
- Run `npm run check`.

## API Documentation

- Update `docs/api/authentication.md`.
- Update `docs/api/admin.md`.
- Update `docs/api/reference.md` error sections.

## Implementation Notes

- Keep guards small and reusable.
- Prefer fail-closed behavior for missing ownership fields.
- Do not rely on display names, channel names, Slack labels, forecast names, or event body fields for ownership.

## Done Definition

- Admin tenant guards implemented and tested.
- Docs explain tenant rules and common errors.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
