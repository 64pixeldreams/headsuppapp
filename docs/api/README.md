# Heads Up API Docs

This folder documents the operational Heads Up API and the integration wrapper.

Primary path:

1. [quickstart.md](quickstart.md) (start here)
2. [reference.md](reference.md) (all props)
3. [use-cases.md](use-cases.md) (what to use when)

Everything else in this folder is supporting context and should link back to those two files.

## Start Here

```text
[quickstart.md](quickstart.md)                 beginner tutorial with request and response examples
[reference.md](reference.md)                  canonical action/property reference
[use-cases.md](use-cases.md)                  practical value and pattern mapping
[node-cloudflare-client.md](node-cloudflare-client.md)     wrapper install and usage guide
[webhook-receivers.md](webhook-receivers.md)          Slack and generic callback receiver guide
[watch-types.md](watch-types.md)                plain-English feature and watch catalog
[getting-started-api-keys.md](getting-started-api-keys.md)   first-run bootstrap and service API keys
[cursor-api-instructions.md](cursor-api-instructions.md)    copy-paste PowerShell API sheet
[openapi.yaml](openapi.yaml)                  machine-readable deployed endpoint surface
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

Use [cursor-api-instructions.md](cursor-api-instructions.md) for the shortest copy-paste API path, [reference.md](reference.md) for endpoint/action schemas, [use-cases.md](use-cases.md) for value-based pattern selection, [spec-alignment-audit.md](spec-alignment-audit.md) for product alignment, and [smoke-test-suite.md](smoke-test-suite.md) for release proof commands.
