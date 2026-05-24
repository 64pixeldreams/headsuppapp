# Heads Up Architecture Gap Audit (2026-05-24)

This audit checks the current repository against `headsupp.io` messaging and current product specs.

## Confirmed Already Implemented

- Aggregation-first runtime with queue consumer and D1 aggregate upserts.
- Contract-path extraction for value/time/CTA with fallback behavior.
- Dimension-aware aggregate identity (`dimensions_hash`, `dimensions_json`).
- Late-event-safe `last_value` updates.
- Idempotency processing-state flow (`processing` -> `processed`).
- Foretic D1-canonical provisioning for runtime resources.
- Recovery semantics in Foretic defaults via `recovery_json`.
- `DELTA_LT` and `DELTA_GT` watch support.
- Outbound webhook signing headers (`timestamp`, `signature`, `delivery_id`) when signing secret is configured.
- Protected observability endpoint with operator auth requirement.

## Confirmed Missing / Partial Gaps

- No email inbound connector runtime path for Cloudflare Email events.
- No email MIME/html/text extraction pipeline.
- No AI classification layer for email-to-signal normalization.
- No channel contract runtime model (`channel_contracts`) and versioned defaults.
- No user-facing alert/watch-state read API endpoints beyond operator observability counts.
- No action controls for snooze/ignore/mute/resume.
- No quiet summary delivery path ("watching N signals — all quiet").
- Trend coverage is partial: delta exists, but richer percent/window-vs-window types are missing.
- Recurring expectation semantics are basic compared with due-window/amount-range matching.
- No email subscriber delivery target.
- No setup-assistant draft endpoint for purpose/sample payload to contract suggestion flow.

## Notes On Website-Scan Accuracy

- The external scan was directionally useful but partly stale:
  - Dimensioned aggregation, CTA preservation, outbound signing, and DELTA watches were listed as missing but are now implemented in code.
- The larger architectural gaps (email+AI, channel contracts, user-facing read/action APIs, quiet summaries) remain valid.

## Story Mapping

New stories were added to `stories/77` through `stories/88` to address validated gaps, with non-email architecture first and email/AI as explicit stubs/interfaces.
