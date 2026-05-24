# Foretic Receive Alerts And Aggregates_done

## Spec Check

Foretic receives Heads Up alerts and aggregate-forward payloads by webhook. The spec requires clean aggregate payloads, no raw event forwarding, CTA links back to source systems, and stable ids so receivers can dedupe retries.

## Scope

- Define receive-side payload classification for Foretic callbacks.
- Ensure alert payloads include alert/watch/signal ids and CTA.
- Ensure aggregate-forward payloads include stable delivery/dedupe ids and bucket values.

## Acceptance Criteria

- Foretic can distinguish `heads_up.alert` from `aggregate_bucket_closed`.
- Aggregate-forward payloads include stable ids for retry dedupe.
- Alert payloads preserve source CTA.
- No raw input event bodies are forwarded to Foretic.

## Test Plan

- Unit test alert receive contract.
- Unit test aggregate-forward receive contract.
- Unit test unknown payload rejection.

## Status

Done.
