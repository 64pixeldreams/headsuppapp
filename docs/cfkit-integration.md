# CFKit Integration

Heads Up vendors CFKit locally from the Foretic project.

## Location

```text
cfkit/
  src/modules/
  src/models/
  docs/
  examples/
```

The runnable Heads Up Worker app is:

```text
apps/headsupp-api
```

## Why CFKit Is Here

CFKit gives Heads Up a proven Cloudflare-native app shell:

```text
CloudFunction dispatch
auth/session/API key patterns
logging
DataModel metadata storage
D1/KV schema helpers
framework docs and examples
```

This lets Cursor build admin and metadata stories quickly without inventing framework code from scratch.

## Use CFKit For The Control Plane

Use CFKit for lower-volume configuration and admin behavior:

```text
workspaces
channels
connectors
subscribers
signals
signal contracts
watches
watch state inspection
alert inspection
delivery inspection
admin CloudFunctions
auth
logs
```

These objects are metadata. They benefit from CFKit's DataModel and CloudFunction patterns.

## Do Not Use CFKit For The Hot Path

Do not use CFKit DataModel for high-volume event aggregation.

The hot path must stay direct and explicit:

```text
POST /v1/events/{connector_key}
-> validate and authenticate
-> enqueue raw event
-> queue consumer folds batches
-> D1 atomic aggregate upsert
-> Durable Object evaluates watches
-> delivery queues dispatch webhooks
```

Reasons:

```text
raw events can be high-volume
aggregate counters need atomic SQL
watch decisions need serialized state transitions
delivery retries need stable queue semantics
ingest must return 202 without inline processing
```

## Resource Naming

Heads Up Cloudflare resources should be scoped with `headsup_` names:

```text
Worker: headsupp_app
D1 database: headsup_db
Queues:
  headsup-raw-events
  headsup-alert-delivery
  headsup-aggregate-delivery
KV bindings:
  HEADSUPP_USERS
  HEADSUPP_SESSIONS
  HEADSUPP_CACHE
  HEADSUPP_EMAILS
  HEADSUPP_KEYS
  HEADSUPP_LISTS
Durable Object binding:
  WATCH_EVALUATOR
```

The D1 binding remains `DB` because CFKit expects that conventional binding name.

## Vendor Notes

The vendored KV adapter supports both older CFKit binding names and Heads Up-scoped binding names:

```text
USERS or HEADSUPP_USERS
SESSIONS or HEADSUPP_SESSIONS
CACHE or HEADSUPP_CACHE
KEYS or HEADSUPP_KEYS
NIMBUS_LISTS or HEADSUPP_LISTS
```

This allows Heads Up to keep resource names scoped without rewriting the whole framework.

## First App Verification

From `apps/headsupp-api`, run:

```bash
npm test
```

The first passing tests should prove:

```text
GET /health works
GET /api/v1/health works
POST /api/function dispatches a CFKit function
POST /v1/events/{connector_key} is reserved but reachable
```
