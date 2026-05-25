# Heads Up API Docs

This folder documents how to use the Heads Up service.

Every story that creates or changes public API behavior must update this folder in the same change.

## Required For Each API Document

Each API document should include:

```text
purpose
authentication
request examples
response examples
error cases
ownership/tenant rules
related stories
```

## Initial API Areas

```text
quickstart.md
cursor-api-instructions.md
reference.md
authentication.md
admin.md
schema-and-migrations.md
foretic-provisioning.md
subscribers.md
connectors-and-ingest.md
alerts-and-deliveries.md
aggregate-forwarding.md
observability.md
spec-alignment-audit.md
spec-fit-and-proof-tests.md
smoke-test-suite.md
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
