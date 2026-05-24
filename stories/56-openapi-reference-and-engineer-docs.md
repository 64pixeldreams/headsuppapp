# OpenAPI Reference And Engineer Docs_done

## User Story

As an engineer or Cursor agent, I want a precise API reference, so I can provision resources, send events, interpret responses, and run smoke tests without reading implementation code.

## Scope

- Create an OpenAPI-style reference for current public endpoints.
- Document `/health`, `/api/v1/health`, `/api/v1/observability/overview`, `/api/function`, and `/v1/events/{connector_key}`.
- Document CFKit action names and payload schemas.
- Document event payload schema, HMAC signing, response shapes, and error codes.
- Document subscriber payloads for generic alerts, Slack alerts, and aggregate forwards.
- Document smoke commands and required runtime environment variables.

## Out Of Scope

- Publishing docs site.
- SDK generation.
- UI documentation.

## Acceptance Criteria

- An engineer can create a workspace/channel/connector/signal/watch/subscriber from docs alone.
- An engineer can sign and send an event from docs alone.
- Docs state which behaviours are asynchronous and how to verify them.
- Docs include fake examples only.
- Docs clearly mark runtime-only secrets.

## Test Plan

- Validate examples against current tests where practical.
- Run `npm run check`.
- Run at least the generic Slack smoke after any behaviour-affecting doc/script changes.
- Secret scan for Slack and API token fragments.

## API Documentation

- Add `docs/api/openapi.md` or `docs/api/reference.md`.
- Update `docs/api/README.md`.
- Update `docs/api/quickstart.md` as needed.

## Implementation Notes

- Keep examples copy-pasteable.
- Avoid real Cloudflare token, Slack webhook, or connector secret values.
- Prefer stable fake IDs and fake domains.

## Done Definition

- Reference docs added.
- Existing docs cross-link to reference.
- Examples are consistent with implementation.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
