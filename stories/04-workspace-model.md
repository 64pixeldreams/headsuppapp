# Workspace Model_done

## Spec Check

Workspaces are the tenant boundary. For Foretic's first integration, `external_tenant_id` temporarily uses the Foretic user id until Foretic has an org/customer tenant model.

## Scope

- Represent workspaces in D1 schema.
- Preserve ownership fields used by the Foretic provisioning services.
- Keep current KV-backed provisioning API compatible.

## Acceptance Criteria

- Workspace rows support stable id/key, name, source app, external tenant, external user, status, and timestamps.
- Tenant isolation rules are documented in API auth docs.

## Test Plan

- Existing Foretic provisioning and tenant-context tests verify workspace identity and tenant boundary behavior.

## Status

Done.
