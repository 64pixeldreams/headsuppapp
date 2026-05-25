# Heads Up API Docs

This folder documents the operational Heads Up API and the integration wrapper.

If you are new to the API, start with `quickstart.md`. If you only need a first service key, start with `getting-started-api-keys.md`. If you are integrating from Node or Cloudflare Workers, use `node-cloudflare-client.md`.

## Start Here

```text
quickstart.md                 beginner tutorial with request and response examples
getting-started-api-keys.md   first-run bootstrap and service API keys
webhook-receivers.md          Slack and generic callback receiver guide
watch-types.md                plain-English feature and watch catalog
node-cloudflare-client.md     wrapper install and usage guide
foretic-wrapper-guide.md      Foretic provisioning and event-sending flow
foretic-provisioning.md       Foretic CFKit provisioning reference
cursor-api-instructions.md    copy-paste PowerShell API sheet
reference.md                  full endpoint and action reference
openapi.yaml                  machine-readable deployed endpoint surface
```

## Current API Truth

```text
authentication.md
admin.md
connectors-and-ingest.md
subscribers.md
webhook-receivers.md
watch-types.md
alerts-and-deliveries.md
aggregate-forwarding.md
observability.md
schema-and-migrations.md
smoke-test-suite.md
spec-alignment-audit.md
spec-fit-and-proof-tests.md
openapi.yaml
```

## Documentation Standard

Every public behavior change should update this folder with:

```text
plain-English purpose
required auth or permission
request example
success response example
common error response example
which value to save for the next step
secret-safety notes
```

## Operational API

Worker app:

```text
headsupp_app
```

Local app folder:

```text
apps/headsupp-api
```

Base endpoints:

```text
GET /health
GET /api/v1/health
GET /api/v1/observability/overview
POST /api/function
POST /v1/events/{connector_key}
```

The ingest route validates connector HMAC, queues raw events, and returns `202 Accepted`. Processing happens asynchronously through Cloudflare Queues.

Use `cursor-api-instructions.md` for the shortest copy-paste API path, `reference.md` for endpoint/action schemas, `spec-alignment-audit.md` for product alignment, and `smoke-test-suite.md` for release proof commands.
