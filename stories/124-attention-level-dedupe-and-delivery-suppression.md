# Attention Level Dedupe And Delivery Suppression

Status: implemented.

Implemented in:

- `apps/headsupp-api/src/services/alerts/persistence.js`
- `apps/headsupp-api/src/services/delivery/alert-delivery-consumer.js`
- `apps/headsupp-api/test/unit/alert-persistence.test.js`
- `docs/api/alerts-and-deliveries.md`
- `docs/api/watch-types.md`
- `docs/public-sdk/cookbook/noise-control.md`

## User Story

As a recipient, I want Heads Up to send one meaningful notification for one customer moment even if the source app or provisioning created multiple matching alerts, so a noisy integration becomes signal instead of inbox noise.

## Why This Matters

Heads Up already has several lower-level dedupe controls:

- raw event idempotency;
- watch cooldown and recovery;
- watch-group winner selection;
- `alert_deliveries` uniqueness per alert/subscriber.

The Foretic incident showed the missing product-level invariant: multiple different alerts can still represent the same moment for the same recipient. If a bad app fires bad events or bad rules through Heads Up, the platform should collapse them before delivery where safe.

## Product Fit

This is core Heads Up: an attention-processing layer. It should be generic across email, Slack, and webhook subscribers, not forecast-specific.

## Proposed Concept

Add an **attention fingerprint** for delivery suppression.

Fingerprint inputs:

```text
subscriber_id
workspace_id
channel_id
signal_id or signal_key
resource identity from alert payload fields:
  resource_id | forecast_id | job_id | external_resource_id | dimensions_hash
attention_family:
  watch_group_key if present
  else configured watch config attention_family
  else signal_key + normalized watch purpose
bucket/window:
  bucket_type + bucket_start_at
severity window:
  keep highest severity winner inside the same fingerprint
```

The exact fingerprint builder must be small, documented, and testable. It should prefer generic fields (`resource_id`, `resource_name`, dimensions) and only use domain aliases like `forecast_id` as optional inputs.

## Behavior

- Before enqueueing/sending deliveries, calculate a fingerprint per `alert + subscriber`.
- If another delivery for the same fingerprint is already pending/sent in the same window, suppress the lower-priority duplicate.
- Highest severity wins: critical beats warning/info. If equal severity, prefer grouped watch winner, then newest alert or deterministic watch id order.
- Suppressed rows are recorded with status such as `suppressed_duplicate` or a dedicated suppression table so trace/debug can explain what happened.
- The original alert row may still be persisted for observability, but it must not produce a customer delivery.

## Out Of Scope

- Rewriting customer copy.
- Global ML/noise classification.
- Cross-day digesting.
- Removing legitimate distinct alerts that use different resource ids or attention families.

## Acceptance Criteria

- Same subscriber + same resource + same signal + same bucket + warning and critical alerts results in one delivered notification: critical.
- Same alert retried still remains idempotent via existing delivery id behavior.
- Different resources in the same channel both deliver.
- Different subscribers can each receive one delivery.
- Different attention families can both deliver when intentionally configured.
- Suppressed duplicates are visible in `admin.traceEvent` / timeline output.
- Works for email, Slack, and webhook delivery paths because suppression happens before enqueue or at delivery persistence.

## Test Plan

- Unit test fingerprint builder with generic `resource_id`, `forecast_id`, dimensions, and missing resource fallback.
- Unit test `persistAlertWithDeliveries` suppresses duplicate subscriber deliveries for same fingerprint/window.
- Unit test severity winner: critical suppresses warning; warning does not suppress an already-sent critical.
- Integration test with two ungrouped legacy watches on one signal: one customer delivery.
- Integration test with grouped policy remains unchanged.
- Smoke test: intentionally configure two bad watches and one subscriber, send one event, assert one sent delivery and one suppressed duplicate.
- Run `npm run check` from `apps/headsupp-api`.

## Docs

- Update `docs/api/watch-types.md` and `docs/api/alerts-and-deliveries.md` with attention-level dedupe semantics.
- Update `docs/api/reference.md` for any new delivery status (`suppressed_duplicate`) or trace fields.
- Update public SDK troubleshooting/noise-control cookbook.

## Done Definition

- Heads Up has a final platform safety net: one customer moment cannot fan out into multiple same-recipient emails just because an integrator configured overlapping watches.
- Suppression is explainable, auditable, and generic.
- Tests and smoke cover bad integrator behavior becoming one meaningful signal.
