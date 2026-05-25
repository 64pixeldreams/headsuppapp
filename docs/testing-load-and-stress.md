# Load And Stress Testing

The stress harness is local and synthetic. It does not call real Cloudflare queues, Foretic, Slack, or external webhooks.

Run:

```bash
cd apps/headsupp-api
npm run load:smoke
```

Optional event count:

```bash
LOAD_EVENT_COUNT=10000 npm run load:smoke
```

For a higher-volume local proof:

```bash
npm run load:high-volume
```

Optional high-volume event count:

```bash
HEADSUPP_HIGH_VOLUME_EVENT_COUNT=100000 npm run load:high-volume
```

The smoke harness verifies:

- raw event message generation keeps one queue message per event
- synthetic events have unique idempotency keys
- minute/hour aggregate deltas fold into fewer D1 upserts
- the compression path can be tested without producing alerts for every raw event

`load:high-volume` uses the same invariant checks with a default of 100000 synthetic events. It is intentionally local and configurable so large runs can be done before release without slowing every CI job.

This maps to the product brief stress requirements for large batched ingest, high-frequency single-signal traffic, retry dedupe, and aggregate compression.
