# Heads Up Stories

This folder contains the build queue for Heads Up.

Each numbered Markdown file is one story stub. Expand one story at a time using:

- `docs/story-execution.md`
- `docs/cursor-build-loop.md`
- `docs/testing-harness.md`
- `docs/api/README.md`

## Build Rule

Cursor should build one story at a time and run:

```bash
npm test
```

If tests fail, Cursor should fix the issue and rerun tests until green before moving on.

If a story creates or changes an endpoint, auth rule, event payload, delivery payload, or integration behavior, Cursor must update `docs/api/` in the same story.

## Current Story Count

There are 49 story stubs.

These are intentionally small headings right now. They should be expanded only when ready to build so scope stays tight.
