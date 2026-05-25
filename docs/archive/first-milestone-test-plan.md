> Historical document. This file is preserved for context and may not describe the current operational API. Use `README.md`, `docs/README.md`, and `docs/api/README.md` for current documentation.

# First Milestone Test Plan

The first milestone is a thin but correct alert path.

Do not build the full platform first. Prove one complete attention loop.

## Milestone Goal

Prove:

```text
event accepted
event validated
event bucketed
aggregate folded
LAST_VALUE_LT watch evaluated
warning alert created once
repeated warning suppressed
critical escalation allowed
recovery alert allowed
```

## Minimum Test Files

Create these first:

```text
test/unit/buckets.test.js
test/unit/fold-batch.test.js
test/unit/watch-evaluator.test.js
test/unit/cooldown.test.js
test/unit/hmac.test.js
test/integration/ingest-route.test.js
```

## Minimum Source Files

Create these first:

```text
src/services/aggregation/buckets.js
src/services/aggregation/fold-batch.js
src/services/watches/evaluate-watch.js
src/services/watches/cooldown.js
src/services/auth/hmac.js
src/routes/ingest.js
```

## Success Sequence

The Foretic pace test sequence is the most important first proof:

```text
90 -> no alert
84 -> warning alert
83 -> no alert
82 -> no alert
69 -> critical alert
68 -> no alert
96 -> recovery alert
97 -> no alert
```

## Pass Criteria

Milestone 1 is complete only when:

```text
npm test passes
```

And the tests prove:

```text
aggregation math is correct
last value respects event time
cooldown suppresses repeats
severity escalation bypasses cooldown
recovery sends exactly one alert
ingest returns 202 without inline processing
```

## Defer Until After This Milestone

Do not build these until the first milestone is green:

```text
all watch types
digest watches
full Foretic integration
dashboard or UI
email connector
Slack OAuth
AI extraction
long-term raw event storage
```
