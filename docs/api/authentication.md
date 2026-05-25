# Authentication

Heads Up uses two authentication layers.

## Control Plane Auth

Control-plane APIs use CFKit authentication:

```text
Authorization: Bearer <api_key>
```

Use this for:

```text
creating workspaces
creating channels
creating connectors
creating subscribers
creating signals
creating watches
reading configuration
```

For the first Foretic integration, Foretic uses one Heads Up service API key.

That API key must have service permissions such as:

```text
foretic:provision
workspace:create
channel:create
connector:create
subscriber:create
signal:create
watch:create
alert:read
watch:read
watch:control
```

The canonical Foretic service permission set is:

```text
foretic:provision
workspace:create
channel:create
connector:create
subscriber:create
signal:create
watch:create
alert:read
watch:read
watch:control
```

Any endpoint that provisions Foretic-owned resources must require `foretic:provision`.

Debugging authenticated requests can use the CFKit function:

```json
{
  "action": "headsupp.authContext",
  "payload": {}
}
```

Response shape:

```json
{
  "success": true,
  "data": {
    "auth": {
      "type": "api",
      "user_id": "user:foretic-service",
      "email": "foretic-integration@headsupp.internal",
      "permissions": ["foretic:provision"],
      "has_foretic_provision": true
    }
  }
}
```

The response must never include API keys, connector secrets, Slack webhook URLs, or token material.

## Operator Bootstrap

Initial service API keys can be created through the operator bootstrap CloudFunction:

```json
{
  "action": "operator.bootstrapServiceApiKey",
  "payload": {
    "name": "Heads Up provisioning service",
    "user_id": "service:headsupp-operator",
    "permissions": [
      "workspace:create",
      "channel:create",
      "connector:create",
      "subscriber:create",
      "signal:create",
      "watch:create",
      "alert:read",
      "watch:read",
      "watch:control"
    ]
  }
}
```

Send the bootstrap token as a runtime-only header:

```text
X-HeadsUp-Bootstrap-Token: <runtime bootstrap token>
```

The response includes the raw `api_key` only once. Store it outside the repo. Heads Up stores hashed key material in the CFKit `APIKEY` KV namespace.

## API Key Lifecycle

Operators with `api_key:manage` can use:

```text
operator.listServiceApiKeys
operator.revokeServiceApiKey
operator.rotateServiceApiKey
```

Lifecycle responses return safe metadata only, except that key creation and rotation return the new raw key once. Revoked or rotated keys cannot authenticate protected control-plane actions.

## Event Ingest Auth

Event ingest does not use the Foretic service API key.

Event ingest uses connector-level HMAC:

```text
POST /v1/events/{connector_key}
X-HeadsUp-Timestamp: 2026-05-24T10:00:00Z
X-HeadsUp-Signature: sha256=<signature>
```

The signature payload is:

```text
timestamp + "." + raw_body
```

The connector maps to:

```text
user_id
workspace_id
channel_id
source_app
external_tenant_id
external_user_id
external_resource_id
```

The request body must not be trusted for ownership.

## Tenant Rule

All resources must be sandboxed by:

```text
source_app + external_tenant_id + workspace_id
```

Every read or write that references an existing resource must verify:

```text
resource.source_app == requested source_app
resource.external_tenant_id == requested external_tenant_id
resource.workspace_id == requested workspace_id, when workspace-scoped
channel.workspace_id == workspace.workspace_id
subscriber.channel_id belongs to subscriber.workspace_id
```

Current admin create actions enforce these relationships before writes where a referenced resource already exists. Missing ownership context fails closed when authenticated API-key metadata includes tenant fields.

Do not rely on channel names, forecast names, Slack labels, or request body ownership fields for authorization.

The deployed tenant isolation smoke proves the current API behaviour with two workspaces that intentionally share the same `signal_key`:

```bash
cd apps/headsupp-api
npm run smoke:tenant-isolation
```

Expected proof:

```text
tenant A and tenant B can both use demo.shared.metric
tenant A aggregate stores tenant A value only
tenant B aggregate stores tenant B value only
tenant A trigger creates one alert and one delivery
tenant B normal event creates no alert or delivery
```

For Foretic:

```text
source_app = "foretic"
external_tenant_id = Foretic customer/account/org id
external_user_id = Foretic user id
```

## Related Stories

```text
42-auth-service-account-and-permissions.md
43-foretic-external-tenant-context.md
44-workspace-ownership-and-tenant-isolation.md
49-connector-secret-and-hmac-ingest-auth.md
58-operator-service-api-key-bootstrap.md
60-api-key-lifecycle-and-rotation.md
61-admin-tenant-permission-hardening.md
```
