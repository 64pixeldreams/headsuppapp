# Testing Harness

Heads Up should be built with a fast local test harness from the first story.

Most bugs in this product will come from time windows, idempotency, aggregation math, cooldown state, retries, and duplicate delivery. These must be covered with deterministic tests.

## Recommended Test Runner

Start with Node's built-in test runner:

```bash
node --test
```

Use it because it is simple, fast, and does not require extra setup.

## Test Folder Shape

The operational API uses this structure:

```text
test/
  unit/
    buckets.test.js
    fold-batch.test.js
    hmac.test.js
    payload-validation.test.js
    watch-evaluator.test.js
    cooldown.test.js
    backoff.test.js
  integration/
    ingest-route.test.js
    aggregate-upsert.test.js
    idempotency.test.js
    delivery-retry.test.js
```

Keep unit tests independent from Cloudflare runtime bindings. Integration tests can use local fakes for D1, queues, and webhook dispatch until Miniflare or Worker integration testing is added.

## Pure Function Targets

Design these modules so they can be tested without a running Worker:

```text
src/services/auth/hmac.js
src/services/events/validate-event.js
src/services/events/normalize-event.js
src/services/aggregation/buckets.js
src/services/aggregation/fold-batch.js
src/services/aggregation/aggregate-sql.js
src/services/watches/evaluate-watch.js
src/services/watches/cooldown.js
src/services/delivery/backoff.js
```

## Required Unit Tests

### Bucket Calculation

Given:

```text
2026-05-23T14:37:22Z
```

Expect:

```text
minute = 2026-05-23T14:37:00.000Z
hour = 2026-05-23T14:00:00.000Z
day = 2026-05-23T00:00:00.000Z
month = 2026-05-01T00:00:00.000Z
```

If weekly buckets are added later, add week tests before implementing spend watches that depend on them.

### Batch Folding

Given values:

```text
10, 20, 12, 15, 16, 21, 4
```

Expect:

```text
sum = 98
count = 7
avg = 14
min = 4
max = 21
last = 4
```

Also test out-of-order events. `last` must mean latest by `occurred_at`, not the last array element.

### HMAC Authentication

Test:

```text
valid timestamp + signature passes
timestamp older than allowed skew fails
invalid signature fails
modified body fails
```

Use constant-time comparison in implementation.

### Payload Validation

Test:

```text
single event accepted
batch event accepted
missing signal_key rejected
invalid occurred_at rejected
missing value.num rejected for numeric signals
payload over configured size rejected
```

### Watch Evaluation

Test the Foretic pace sequence:

```text
90 -> silent
84 -> warning alert
83 -> silent
82 -> silent
69 -> critical escalation
68 -> silent
96 -> recovery alert
97 -> silent
```

### Cooldown

Test:

```text
same severity during cooldown is suppressed
higher severity during cooldown is allowed
recovery during cooldown is allowed when configured
cooldown expiration allows a new alert
```

### Backoff

Test:

```text
attempt 1 = immediate
attempt 2 = +1 minute
attempt 3 = +5 minutes
attempt 4 = +15 minutes
attempt 5 = +1 hour
attempt 6 = +6 hours
attempt 7 = permanent failure
```

## Required Integration Tests

### Ingest Route

Test:

```text
POST /v1/events/{connector_key} returns 202
valid batch creates queue messages
disabled connector is rejected
invalid HMAC is rejected
ingest does not write aggregates inline
ingest does not send webhooks inline
```

### Idempotency

Test:

```text
same idempotency_key sent twice
only one aggregate update occurs
only one watch evaluation occurs
```

### Aggregate Upsert

Test concurrent or repeated updates to the same signal and bucket.

Expected:

```text
sum/count/min/max/avg remain correct
last_value is only replaced by a newer occurred_at
late events update sum/count/min/max but do not corrupt last_value
```

### Delivery Retry

Test:

```text
2xx marks sent
429 retries
5xx retries
network error retries
400/401/403/404 fail permanently unless configured otherwise
```

## Red-Green Rule

Cursor should always see a failing test before a risky behavior is considered implemented. The most important tests are:

```text
aggregate correctness
idempotency
alert suppression
escalation
recovery
delivery retry
closed bucket forwarding
missing expected events
```
