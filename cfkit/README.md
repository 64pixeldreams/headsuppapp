# CFKit Vendor Snapshot

This folder contains a vendored copy of the Cloudflare App Kit / CFKit framework used by Foretic.

## Source

Copied from local project:

```text
C:\Users\marti\Documents\foretic-saas\foretic-saas\cf
```

Snapshot contents:

```text
src/modules
src/models
docs
examples
CFKIT_*.md
```

## Usage In Heads Up

Heads Up imports CFKit from this local folder. For example, the Worker app at `apps/headsupp-api` imports:

```text
../../../cfkit/src/modules/cloudfunction/index.js
../../../cfkit/src/modules/logs/index.js
```

## Boundary

Use CFKit for the Heads Up control plane:

```text
admin functions
metadata models
auth
logging
model registration
schema helpers
```

Do not use CFKit DataModel for high-volume event aggregation. The event engine should use direct Cloudflare primitives:

```text
Cloudflare Queues
D1 atomic upserts
Durable Objects
Cron Triggers
direct webhook dispatch queues
```

See `docs/cfkit-integration.md` for the project-specific rule.
