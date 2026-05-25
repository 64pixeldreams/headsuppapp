# Authentication

Primary docs: use [quickstart.md](quickstart.md) for setup flow and [reference.md](reference.md) for canonical auth headers and action permissions. This file keeps auth-specific detail.

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

A service API key should have only the permissions needed by the integration.

## Permission Profiles

Use these named profiles as defaults:

```text
headsupp:operator
  api_key:manage
  audit:read

headsupp:admin
  workspace:create
  channel:create
  channel:read
  channel:update
  connector:create
  subscriber:create
  signal:create
  watch:create
  channel_contract:create
  channel_contract:update
  channel_contract:read
  alert:read
  watch:read
  watch:control

foretic:provisioner
  foretic:provision

foretic:runtime
  workspace:create
  channel:create
  channel:read
  channel:update
  connector:create
  subscriber:create
  signal:create
  watch:create
  alert:read
  watch:read
  watch:control
```

Example integration permission set:

```text
workspace:create
channel:create
channel:read
channel:update
connector:create
subscriber:create
signal:create
watch:create
alert:read
watch:read
watch:control
```

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
      "user_id": "user:integration-service",
      "email": "integration@headsupp.internal",
      "permissions": ["workspace:create"],
      "has_foretic_provision": false
    }
  }
}
```

The response must never include API keys, connector secrets, Slack webhook URLs, or token material.

Foretic-specific control-plane functions (`foretic.provisionWorkspace`, `foretic.createForecastWatch`) require `foretic:provision`.

## Operator Bootstrap

Initial service API keys can be created through the operator bootstrap CloudFunction:

The bootstrap token comes from the runtime Worker secret `HEADSUPP_BOOTSTRAP_TOKEN`. Operators set it in Cloudflare and pass it at runtime only; it is not stored in the repository. For the full first-run flow, see [getting-started-api-keys.md](getting-started-api-keys.md).

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
      "channel_contract:create",
      "channel_contract:update",
      "channel_contract:read",
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

Event ingest does not use a service API key.

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

Example ownership mapping:

```text
source_app = producer app id
external_tenant_id = producer tenant/account/org id
external_user_id = producer user id
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
