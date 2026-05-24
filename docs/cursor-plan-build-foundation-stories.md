# Cursor Plan: Build Foundation Stories

This plan tells Cursor how to turn the current story stubs into a working Heads Up API.

## Objective

Build the API foundation in small tested stories until Foretic can provision a forecast watch with a Slack webhook subscriber and later send HMAC-signed events.

## Required Operating Loop

For every story:

```text
expand story markdown
write focused tests
implement the smallest working slice
update docs/api if public behavior changes
run npm test
fix failures
rerun until green
mark story done in the story file
move to next story
```

Use:

```text
docs/cursor-build-loop.md
docs/testing-harness.md
docs/story-execution.md
docs/api/README.md
```

## First Build Sequence

Start with the new foundation stories before broad CRUD:

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

## Story 42: Auth Service Account And Permissions

Goal:

```text
Heads Up can represent a Foretic service account and require foretic:provision for Foretic provisioning APIs.
```

Tests:

```text
valid service auth with foretic:provision passes
auth without foretic:provision is rejected
missing auth is rejected
permission helper is pure and unit-tested
```

API docs:

```text
docs/api/authentication.md
```

## Story 43: Foretic External Tenant Context

Goal:

```text
Validate and normalize source_app, external_tenant_id, external_user_id, external_account_id, and external_resource_id.
```

Tests:

```text
valid Foretic tenant context accepted
missing external_tenant_id rejected
missing external_user_id rejected
source_app is forced or validated as foretic
unexpected client user_id is ignored or rejected
```

API docs:

```text
docs/api/foretic-provisioning.md
```

## Story 44: Workspace Ownership And Tenant Isolation

Goal:

```text
Create ownership helpers so every workspace/channel/subscriber lookup is scoped by source_app + external_tenant_id + workspace_id.
```

Tests:

```text
org A cannot fetch org B workspace
channel must belong to workspace
subscriber must belong to channel workspace
client cannot bypass tenant filters
```

API docs:

```text
docs/api/authentication.md
docs/api/foretic-provisioning.md
```

## Story 45: Foretic Provision Workspace

Goal:

```text
Create foretic.provisionWorkspace CloudFunction.
```

Behavior:

```text
requires foretic:provision
finds or creates workspace by source_app + external_tenant_id
stores tenant context
returns workspace_id and workspace_key
is idempotent for the same external_tenant_id
```

Tests:

```text
first call creates workspace
second call returns same workspace
different tenant creates different workspace
missing permission rejected
```

API docs:

```text
docs/api/foretic-provisioning.md
```

## Story 46: Slack Webhook Subscriber

Goal:

```text
Create slack_webhook subscriber support.
```

Behavior:

```text
valid https Slack webhook URL accepted
non-https URL rejected
subscriber inherits workspace/channel/tenant context
subscriber mode defaults to alert
```

Tests:

```text
valid Slack webhook subscriber created
invalid URL rejected
cross-workspace channel rejected
tenant fields stored
```

API docs:

```text
docs/api/subscribers.md
```

## Story 47: Generic Webhook Subscriber

Goal:

```text
Create generic webhook subscriber support for Foretic callbacks and third-party systems.
```

Tests:

```text
valid https webhook accepted
mode alert accepted
mode aggregate_forward accepted
invalid mode rejected
cross-tenant creation rejected
```

API docs:

```text
docs/api/subscribers.md
```

## Story 48: Foretic Create Forecast Watch

Goal:

```text
Create foretic.createForecastWatch CloudFunction that provisions the first full forecast attention setup.
```

Behavior:

```text
finds or creates workspace
creates forecast channel
creates connector
creates forecast pace signal
creates warning/critical/recovery watch config
creates Slack subscriber if slack_webhook_url is provided
creates Foretic callback subscriber if foretic_callback_url is provided
returns connector URL and connector secret once
```

Tests:

```text
complete forecast watch provisioning succeeds
repeat call is idempotent or returns existing setup
invalid Slack URL rejected
missing forecast_id rejected
tenant ownership fields are present on all created resources
```

API docs:

```text
docs/api/foretic-provisioning.md
docs/api/subscribers.md
docs/api/connectors-and-ingest.md
```

## Story 49: Connector Secret And HMAC Ingest Auth

Goal:

```text
Implement connector secret generation and HMAC validation for event ingest.
```

Behavior:

```text
connector secret returned once on create
secret stored hashed or encrypted
POST /v1/events/{connector_key} validates HMAC
ownership resolved from connector
request body user/workspace/channel ignored
```

Tests:

```text
valid HMAC accepted
invalid HMAC rejected
old timestamp rejected
connector disabled rejected
event ownership comes from connector
```

API docs:

```text
docs/api/connectors-and-ingest.md
docs/api/authentication.md
```

## Definition Of Done For This Plan

The foundation is ready when:

```text
npm test passes
docs/api describes the implemented endpoints
Foretic service API key can provision workspace
Foretic service API key can create forecast watch
Slack webhook subscriber can be stored
generic webhook subscriber can be stored
connector HMAC can authenticate ingest
tenant isolation tests pass
```

## What Cursor Should Not Build Yet

Do not build these until the above is green:

```text
Slack OAuth
email sending
dashboard UI
all watch types
aggregate forwarding
digest watches
AI extraction
long-term raw event storage
```
