# Cursor Build Loop

Use this document as the operating instruction for building Heads Up quickly without losing correctness.

## Goal

Build Heads Up story by story, with tests proving each slice before moving on.

The loop is:

```text
pick one story
write or update focused tests
implement the smallest working slice
update API usage docs if public behavior changed
run tests
fix failures
rerun tests
repeat until green
move to next story
```

Do not skip the test loop. Do not move to a later story while the current story has failing tests.

## Default Command

The default local verification command is:

```bash
npm run check
```

The API package already exposes:

```json
{
  "scripts": {
    "test": "node --test \"test/**/*.test.js\"",
    "test:unit": "node --test \"test/unit/**/*.test.js\"",
    "test:integration": "node --test \"test/integration/**/*.test.js\"",
    "check": "npm test"
  }
}
```

Preserve this behavior if the test runner changes:

```text
npm test must run the full local test suite.
npm run check must be safe for Cursor to run after every story.
```

## Implementation Rules

1. Keep business logic in pure functions where possible.
2. Test pure functions before Worker integration.
3. Do not put aggregation, watch evaluation, or webhook delivery in the ingest request path.
4. Do not use JavaScript read-modify-write for aggregate counters.
5. Use atomic D1 upserts for aggregates.
6. Use Durable Objects for serialized watch decisions.
7. Persist alerts and delivery rows before dispatching webhooks.
8. Keep `docs/api/` current for anything another system or user will call.
9. Re-run tests after every fix.

## First Green Path

The first milestone should prove this path:

```text
incoming event
-> validate payload
-> calculate buckets
-> fold aggregate deltas
-> evaluate LAST_VALUE_LT watch
-> create one alert
-> suppress repeated alerts
```

Do this before building every watch type, digest behavior, Foretic integration, or broad admin coverage.

## Story Completion Rule

A story is done only when:

1. Its intended behavior is implemented.
2. Focused tests exist.
3. API docs are updated for any public endpoint, auth rule, payload, or integration behavior.
4. `npm test` passes.
5. Any failing test was fixed and re-run.
6. No unrelated refactors were added.

## Cursor Prompt To Use

When asking Cursor to build a story, use this pattern:

```text
Build story <story file>.

Follow docs/cursor-build-loop.md and docs/testing-harness.md.
Write focused tests first where practical.
Update docs/api for any public API behavior this story creates or changes.
Run npm test.
If tests fail, fix the implementation and rerun until the full test suite passes.
Do not move to another story until this story is green.
```
