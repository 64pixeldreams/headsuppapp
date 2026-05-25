> Historical document. This file is preserved for context and may not describe the current operational API. Use [README.md](../../README.md), [docs/README.md](../README.md), and [docs/api/README.md](../api/README.md) for current documentation.

# Foretic Auth And Subscriber Foundation Plan

## Decision

Do not model all Foretic customers as one normal Heads Up user.

Use two identity layers:

```text
Foretic integration account
-> trusted service account used by Foretic backend

Foretic customer/user identity
-> stored on every Heads Up workspace/channel/watch/subscriber as external ownership
```

For the first integration, Foretic can use one Heads Up service API key, but that key should be treated as a server-to-server provisioning key, not as the owner of all customer data.

The service key creates resources for many Foretic users, but every resource must still store:

```text
source_app = "foretic"
external_tenant_id
external_user_id
external_account_id optional
workspace_id
owner_user_id optional until native Heads Up login exists
created_by_service_user_id
```

This lets the MVP work now while preserving the path to real Heads Up user login later.

## Why Not One Shared Normal User

One shared Heads Up user for all Foretic users would be fast, but it creates bad foundations:

```text
all Foretic customer resources belong to one user
authorization cannot distinguish customers
list/get bugs could expose cross-customer data
migration to real login later becomes painful
audit logs say Foretic did everything, not which user/customer caused it
```

The safer model is:

```text
one service account authenticates Foretic backend
resource ownership is still per Foretic user/customer
all queries filter by external_tenant_id and/or workspace_id
```

## Initial Auth Model

### 1. Heads Up Service Account For Foretic

Create a Heads Up user:

```text
email: foretic-integration@headsupp.internal
type: service
permissions:
  foretic:provision
  workspace:create
  channel:create
  connector:create
  subscriber:create
  signal:create
  watch:create
```

Create one API key for Foretic backend:

```text
Authorization: Bearer <foretic_service_api_key>
```

This key is used only by Foretic backend, never by browser clients.

### 2. Foretic User Context In Every Request

Foretic provisioning requests must include:

```json
{
  "source_app": "foretic",
  "external_tenant_id": "foretic_org_123",
  "external_user_id": "foretic_user_456",
  "external_account_id": "customer_or_workspace_id",
  "external_resource_id": "forecast_id_or_channel_ref"
}
```

Heads Up validates that the API key has `foretic:provision`, then uses this context to create or find a workspace/channel for that Foretic user/customer.

## Workspace Strategy

Use one Heads Up workspace per Foretic customer/account, not per forecast.

Example:

```text
workspace_key = foretic:{external_tenant_id}
workspace.name = Foretic / Repairs By Post
workspace.source_app = foretic
workspace.external_tenant_id = foretic_org_123
```

Channels represent operational contexts inside that workspace.

Examples:

```text
foretic:forecast:{forecast_id}
foretic:finance:{account_id}
foretic:ops:{customer_id}
```

## Channel Strategy

For a forecast watch:

```text
channel_key = foretic:{external_tenant_id}:forecast:{forecast_id}
channel.name = Forecast: Repairs By Post May Revenue
channel.purpose = forecast_attention
```

Do not rely on channel names for security. Store explicit ownership fields:

```text
workspace_id
source_app
external_tenant_id
external_user_id
external_resource_id
```

## Subscriber Strategy

First subscriber types:

```text
slack_webhook
webhook
```

Do not build Slack OAuth for MVP.

Foretic users can create their own Slack incoming webhook URL in their own Slack workspace. Foretic sends that webhook URL to Heads Up when creating the subscriber.

### Slack Subscriber

Store:

```text
subscriber_type = "slack_webhook"
destination_url = encrypted or secret-stored Slack incoming webhook URL
display_name = "#alerts" or user-provided label
workspace_id
channel_id
source_app = "foretic"
external_tenant_id
external_user_id
```

Delivery payload can be formatted as Slack incoming webhook JSON:

```json
{
  "text": "Revenue forecast is critical at 64%. View forecast: https://foretic.io/forecasts/fc_123"
}
```

Later, if we add Slack OAuth, this subscriber type can be replaced or complemented by:

```text
slack_oauth_channel
```

### Generic Webhook Subscriber

Store:

```text
subscriber_type = "webhook"
destination_url = customer endpoint
secret_hash or signing_secret
payload_mode = "alert" | "aggregate"
```

Use this for Foretic callbacks and third-party systems.

## Connector Strategy

Provisioning a Foretic watch should create a Heads Up webhook connector:

```text
connector_type = "webhook"
connector_key = generated stable key
connector_secret = generated HMAC secret
workspace_id
channel_id
source_app = "foretic"
external_tenant_id
external_user_id
external_resource_id = forecast_id
```

Foretic stores:

```text
heads_up_event_url = https://<worker>/v1/events/{connector_key}
heads_up_connector_secret = <secret shown once>
```

Foretic emits events signed with HMAC:

```text
X-HeadsUp-Timestamp
X-HeadsUp-Signature
```

## Required Data Model Fields

Every control-plane model should include:

```text
user_id
workspace_id
source_app
external_tenant_id
external_user_id
external_account_id
external_resource_id
created_by
updated_by
created_at
updated_at
```

For the Foretic service-account phase:

```text
user_id = service account user id or mapped Heads Up owner id
created_by = foretic integration service user id
external_user_id = real Foretic user id
external_tenant_id = Foretic customer/org/account id
```

When native Heads Up login exists, `user_id` can become the real Heads Up user id while external IDs remain linkage fields.

## API Functions To Build First

### 1. `foretic.provisionWorkspace`

Input:

```json
{
  "external_tenant_id": "foretic_org_123",
  "external_user_id": "foretic_user_456",
  "name": "Repairs By Post"
}
```

Behavior:

```text
requires foretic:provision
find or create workspace by source_app + external_tenant_id
returns workspace_id
```

### 2. `foretic.createForecastWatch`

Input:

```json
{
  "external_tenant_id": "foretic_org_123",
  "external_user_id": "foretic_user_456",
  "forecast_id": "fc_123",
  "forecast_name": "Repairs By Post May Revenue",
  "slack_webhook_url": "https://hooks.slack.com/services/...",
  "foretic_callback_url": "https://api.foretic.io/heads-up/callback"
}
```

Behavior:

```text
requires foretic:provision
creates or finds workspace
creates channel
creates connector and connector secret
creates forecast pace signal
creates warning/critical/recovery watch
creates slack_webhook subscriber if URL provided
creates webhook subscriber for Foretic callback if URL provided
returns connector URL and secret once
```

### 3. `subscribers.create`

General subscriber creation for later direct Heads Up API use.

Input:

```json
{
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "subscriber_type": "slack_webhook",
  "destination_url": "https://hooks.slack.com/services/...",
  "display_name": "#forecast-alerts"
}
```

Behavior:

```text
requires authenticated user or service permission
verifies workspace/channel ownership
stores subscriber under same tenant/user scope
```

## Security Rules

Never trust from client without validation:

```text
user_id
workspace_id
channel_id
subscriber_id
connector_id
watch_id
```

Always verify:

```text
resource.workspace_id belongs to requested external_tenant_id
resource.source_app matches foretic for Foretic provisioning
API key has required permission
subscriber destination URL is valid https
Slack webhook URL is stored as secret/sensitive data
```

## Tests Required Before Building More API

### Service Account Auth

```text
valid Foretic service API key can provision
normal user API key cannot call foretic provisioning unless permission exists
missing API key rejected
```

### Tenant Isolation

```text
Foretic org A cannot read/update org B resources
workspace lookup filters by source_app + external_tenant_id
channel lookup filters by workspace_id + external_resource_id
subscriber creation rejects channel from another workspace
```

### Subscriber Safety

```text
valid Slack webhook URL accepted
non-https URL rejected
generic webhook URL accepted
subscriber stores tenant ownership fields
subscriber delivery payload does not leak another tenant's data
```

### Connector Safety

```text
connector key maps to exactly one workspace/channel
connector secret is returned only once
event ingest resolves user/workspace/channel from connector, not request body
invalid HMAC rejected
```

## Story Order

Add these before broad admin CRUD:

```text
42-auth-service-account-and-permissions.md
43-foretic-external-tenant-context.md
44-workspace-ownership-and-tenant-isolation.md
45-foretic-provision-workspace.md
46-slack-webhook-subscriber.md
47-generic-webhook-subscriber.md
48-foretic-create-forecast-watch.md
49-connector-secret-and-hmac-ingest-auth.md
```

## First End-To-End Test

```text
1. Create Foretic service API key
2. Foretic calls foretic.createForecastWatch
3. Heads Up creates workspace/channel/connector/signal/watch/subscriber
4. Foretic sends forecast pace event signed with connector secret
5. Heads Up evaluates watch
6. Heads Up sends Slack webhook alert
7. Same warning repeated stays silent
8. Critical escalation sends one more Slack alert
9. Recovery sends one recovery Slack alert
```

## Recommendation

Use one Foretic service API key for the first integration, but do not let that mean one shared customer sandbox.

The real sandbox is:

```text
source_app + external_tenant_id + workspace_id
```

The service API key is only the trusted pipe Foretic uses to provision resources. Every resource still needs tenant/user ownership fields from day one.
