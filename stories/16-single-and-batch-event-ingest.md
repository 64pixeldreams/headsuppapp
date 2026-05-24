# Single And Batch Event Ingest_done

## Spec Check

`SPEC_BREIF.md` says the ingest worker must authenticate the connector, normalize single/batch input, split into queue chunks of max 100, send to `RAW_EVENTS_QUEUE`, and return `202`. The product brief explicitly says ingest must not write aggregates, evaluate watches, or call webhooks inline.

## Scope

- Wire the authenticated ingest route to payload validation.
- Normalize accepted events.
- Build raw queue messages with connector/workspace/channel ids.
- Return `202` with queued/rejected counts.

## Out Of Scope

- Aggregation and watch evaluation in the request path.

## Test Plan

- Integration test valid single event.
- Integration test valid batch.
- Integration test invalid payload rejection.

## API Docs

- Update `docs/api/connectors-and-ingest.md`.

## Status

Done.
