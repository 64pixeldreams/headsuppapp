# Email Inbound Connector Skeleton

## User Story

As a platform owner, I need a minimal inbound-email connector scaffold so we can wire Cloudflare Email events into Heads Up without full extraction logic yet.

## Scope

- Add connector type `email_inbound` as reserved/runtime-gated.
- Add inbound email entrypoint module skeleton for Cloudflare email worker events.
- Persist raw email metadata envelope (safe subset) with queue handoff.

## Acceptance Criteria

- Email connector can be configured but marked experimental.
- Inbound email event is accepted and queued to a dedicated pipeline path.
- No MIME/AI extraction required in this story.

## Test Plan

- Unit tests for connector registration and event handoff.
- Integration test for inbound envelope -> queue path.
- Run `npm run check`.

## API Documentation

- Update `docs/api/connectors-and-ingest.md`.
- Update `docs/api/reference.md`.

## Done Definition

- Email ingress skeleton exists and is isolated behind explicit feature gating.

## Status

Pending.
