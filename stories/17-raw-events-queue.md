# Raw Events Queue_done

## Spec Check

`SPEC_BREIF.md` defines `RAW_EVENTS_QUEUE` messages as `{ workspaceId, channelId, connectorId, receivedAt, event }`, with the ingest worker using `sendBatch` in chunks of max 100. `Curosr_headsupp_product_brief.md` requires raw events to be queued rather than aggregated inline.

## Scope

- Create raw queue message helpers.
- Split queue sends into max-100 batches.
- Wire authenticated ingest to `RAW_EVENTS_QUEUE`.

## Out Of Scope

- Aggregation consumer internals, covered by stories 18-23.

## Test Plan

- Unit tests for message creation and chunking.
- Integration test that ingest queues single and batch messages.

## API Docs

- Update `docs/api/connectors-and-ingest.md`.

## Status

Done.
