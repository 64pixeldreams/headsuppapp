# Getting Started With API Keys

This guide explains how to get the first Heads Up service API key and how to use it safely.

Heads Up has two different secrets:

```text
bootstrap token -> creates or rotates service API keys
service API key -> creates workspaces, channels, subscribers, signals, watches, and reads alerts
```

Do not use connector secrets as API keys. Connector secrets are only for signing event ingest requests to `/v1/events/{connector_key}`.

## Where The Bootstrap Token Comes From

The bootstrap token is an operator-only runtime secret configured on the Cloudflare Worker:

```text
HEADSUPP_BOOTSTRAP_TOKEN
```

Operators set or rotate it with Cloudflare secret tooling, not in source code. For local docs and scripts, pass it through an environment variable only:

```bash
HEADSUPP_BOOTSTRAP_TOKEN=<runtime bootstrap token>
```

Never commit the bootstrap token, API keys, Slack webhook URLs, connector secrets, or Cloudflare tokens.

## Create The First Service API Key

Use this only when no service key exists yet, or when you intentionally create a new integration key.

Request:

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "X-HeadsUp-Bootstrap-Token: $HEADSUPP_BOOTSTRAP_TOKEN" \
  -d '{
    "action": "operator.bootstrapServiceApiKey",
    "payload": {
      "name": "Demo integration service",
      "user_id": "service:demo",
      "source_app": "headsupp-demo",
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
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "api_key": "hu_api_returned_once",
    "key": {
      "key_id": "key_123",
      "name": "Demo integration service",
      "status": "active",
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
}
```

Save `data.api_key` in your secret manager. It is returned once. Future list/read APIs show only safe key metadata and previews.

## Use The Service API Key

All control-plane actions use the service key as a Bearer token:

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createWorkspace",
    "payload": {
      "name": "Demo Workspace",
      "source_app": "headsupp-demo",
      "external_tenant_id": "demo-tenant",
      "external_user_id": "demo-user"
    }
  }'
```

If the key is missing a permission, the API returns a safe error:

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Missing required permission: workspace:create.",
    "status": 403
  }
}
```

## Recommended Permissions

For a normal integration that provisions resources, subscribes callbacks, sends users to alert reads, and supports watch controls:

```text
workspace:create
channel:create
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
```

For Foretic-specific service calls, include:

```text
foretic:provision
```

For operator key lifecycle tools, the operator key needs:

```text
api_key:manage
audit:read
```

## Rotate Or Revoke Keys

Key lifecycle actions use `POST /api/function` with an API key that has `api_key:manage`.

```text
operator.listServiceApiKeys
operator.rotateServiceApiKey
operator.revokeServiceApiKey
operator.listAuditLogs
```

Rotation returns the new raw API key once. Revoke keys that are no longer used.

## SDK Example

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const operator = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  bootstrapToken: process.env.HEADSUPP_BOOTSTRAP_TOKEN,
});

const result = await operator.bootstrapServiceApiKey({
  name: 'Demo integration service',
  user_id: 'service:demo',
  source_app: 'headsupp-demo',
  permissions: [
    'workspace:create',
    'channel:create',
    'connector:create',
    'subscriber:create',
    'signal:create',
    'watch:create',
    'alert:read',
    'watch:read',
    'watch:control',
  ],
});

console.log(result.api_key);
```

Store the printed `api_key` outside the repository, then create your normal client with `apiKey`.

## Next Step

After you have `HEADSUPP_API_KEY`, follow `quickstart.md` to create a workspace, channel, subscriber, connector, signal, watch, and signed event.
