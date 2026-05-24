# Webhook Alert Delivery_done

## Spec Check

`SPEC_BREIF.md` says persisted alert deliveries are dispatched to webhook subscribers, with alert payloads preserving workspace/channel/watch/signal/severity/CTA context. The product brief says Slack/webhooks must not be called inline from ingest.

## Scope

- Build generic webhook alert payloads.
- Build Slack incoming webhook text payloads.
- Dispatch alert deliveries from delivery rows.
- Mark delivery `sent` on 2xx.

## Out Of Scope

- Aggregate-forward delivery.

## Test Plan

- Unit test generic payload.
- Unit test Slack payload.
- Unit test sent delivery update.

## Status

Done.
