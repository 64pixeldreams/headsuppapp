# Story Execution Guide

The `stories/` folder is the build queue for Heads Up.

Each story should be expanded just before implementation. Keep stories small enough that Cursor can build, test, fix, and retest in one focused pass.

## Story Order

Build in numeric order unless there is a clear dependency reason not to.

The intended phases are:

```text
01-03: project foundation
04-10: data model foundation
11-13: admin API
14-18: secure ingest and idempotency
19-23: aggregation pipeline
24-29: watch evaluation and alert creation
30-33: delivery and aggregate forwarding
34-36: scheduled behaviors
37-38: observability and stress tests
39-41: Foretic integration
42-49: Foretic auth, tenant isolation, subscribers, and connector auth
```

## Story Template

Use this structure when expanding a story:

```md
# Story Title

## User Story

As a <user/system>, I want <capability>, so that <outcome>.

## Scope

- In scope item
- In scope item

## Out Of Scope

- Out of scope item

## Acceptance Criteria

- Given ...
- When ...
- Then ...

## Test Plan

- Unit test ...
- Integration test ...
- Run `npm test`

## API Documentation

- Update or create `docs/api/<area>.md`
- Include request example
- Include response example
- Include auth requirements
- Include error cases

## Implementation Notes

- Relevant files
- Important constraints
- Known edge cases

## Done Definition

- Code implemented
- Tests added
- API docs updated if behavior is public or integration-facing
- `npm test` passes
- No unrelated changes
```

## Cursor Working Instruction

For each story, Cursor should:

1. Read the story file.
2. Read `docs/cursor-build-loop.md`.
3. Read `docs/testing-harness.md`.
4. Identify the smallest testable behavior.
5. Add focused tests.
6. Implement only that story's scope.
7. Update `docs/api/` if the story creates or changes public API behavior.
8. Run `npm test`.
9. Fix and retest until green.
10. Stop and report what passed.

## Dependency Rule

If a story reveals a missing earlier dependency, do not patch around it silently. Add the missing dependency to the current story notes or create a new story before continuing.

## Keep Stories Small

If a story gets too large, split it.

Good split examples:

```text
HMAC validation logic
HMAC route integration
HMAC replay timestamp rejection
```

Bad story example:

```text
Build all ingest
```

The goal is fast feedback, not big-bang implementation.
