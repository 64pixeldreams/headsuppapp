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
[email-subscribers.md](email-subscribers.md)          outbound email subscriber and unsubscribe guide
[email-rendering.md](email-rendering.md)             email template selection and event rendering contract
[email-branding.md](email-branding.md)              email logo/footer/icon branding guide
[provisioning.md](provisioning.md)                 one-call channel setup and workspace subscribers
[saas-integration-guide.md](saas-integration-guide.md)       canonical SaaS integration path and Foretic-style board model
[migration-and-cleanup.md](migration-and-cleanup.md)         safe migration between channel/watch/subscriber models
[aggregate-forwarding.md](aggregate-forwarding.md)       closed aggregate bucket forwarding guide
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
email-subscribers.md
email-rendering.md
email-branding.md
provisioning.md
saas-integration-guide.md
migration-and-cleanup.md
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
GET /v1/subscribers/unsubscribe?token=...
GET /v1/subscribers/email-action?token=...
GET /v1/subscribers/confirm?token=...
POST /api/function
POST /v1/events/{connector_key}
```

The ingest route validates connector HMAC, queues raw events, and returns `202 Accepted`. Processing happens asynchronously through Cloudflare Queues.

Use [cursor-api-instructions.md](cursor-api-instructions.md) for the shortest copy-paste API path, [reference.md](reference.md) for endpoint/action schemas, [use-cases.md](use-cases.md) for value-based pattern selection, [spec-alignment-audit.md](spec-alignment-audit.md) for product alignment, [smoke-test-suite.md](smoke-test-suite.md) for release proof commands, and [deployment-infrastructure-testing.md](../deployment-infrastructure-testing.md) for Worker/D1/Email Routing deployment proof.
