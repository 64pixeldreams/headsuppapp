# Deployed Delivery Retry Smoke_done

## User Story

As a maintainer, I want a deployed smoke test for delivery retry and backoff, so transient webhook failures are proven to become retryable deliveries and later succeed without duplicate alerts.

## Scope

- Add a deployed smoke test using a controllable webhook receiver or local test endpoint suitable for Cloudflare.
- Configure a subscriber that initially returns `500` or `429`.
- Trigger an alert delivery.
- Verify delivery transitions to `retrying` with `next_retry_at`.
- Change receiver to return `200`.
- Process retry path and verify delivery becomes `sent`.

## Out Of Scope

- Building a permanent public webhook service unless needed as a small test utility.
- Retrying Slack webhooks directly with forced failures.
- Manual dashboard inspection as the only proof.

## Acceptance Criteria

- Transient `500`/`429` response results in `retrying`, not `failed`.
- Permanent `400`/`401`/`403`/`404` response results in `failed`.
- Retry attempt eventually marks delivery `sent` when receiver returns `200`.
- Attempt count and response metadata are persisted.
- No duplicate alert rows are created by retrying delivery.

## Test Plan

- Unit test any new receiver/client helpers.
- Add deployed smoke command, for example `npm run smoke:delivery-retry`.
- Assert delivery status progression in D1.
- Run `npm run check`.

## API Documentation

- Update `docs/api/subscribers.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.
- Update `docs/final-smoke-runbook.md`.

## Implementation Notes

- Use a fake/test webhook URL, not production Slack, for forced failures.
- Keep retry timings configurable for smoke.
- Ensure output redacts destination URLs.

## Done Definition

- Deployed retry smoke passes.
- Docs updated.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
