# Admin API Workspaces And Channels_done

## Spec Check

The spec lists workspace and channel admin APIs. Control-plane operations must use CFKit auth/logging patterns and preserve tenant boundaries.

## Scope

- Add CFKit CloudFunctions `admin.createWorkspace` and `admin.createChannel`.
- Persist rows to D1 using the core schema.
- Require `workspace:create` and `channel:create` permissions.

## Acceptance Criteria

- Workspace creation stores stable id/key, source app, tenant, user, status, and timestamps.
- Channel creation stores stable id/key, workspace id, ownership context, status, and timestamps.
- No hot event path depends on CFKit DataModel.

## API Docs

Documented in `docs/api/admin.md`.

## Test Plan

- Unit tests cover workspace creation, permission rejection, and SQL insert shape.

## Status

Done.
