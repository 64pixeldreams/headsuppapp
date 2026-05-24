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

Do not rely on channel names, forecast names, Slack labels, or request body ownership fields for authorization.

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
```
