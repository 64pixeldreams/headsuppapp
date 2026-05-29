# Final Pass Polish Closeout (Quick Wins, Backward-Compatible)

Status: planned.

## Goal

Close the project with a small, low-risk polish pass that improves diligence/readiness without changing core behavior.

## Verified Findings (from `final pass polish` review)

Validated in current repo state:

1. **SDK install/version docs drift exists**
   - `packages/headsupp-client/package.json` is `0.1.2`
   - SDK README still references `@64pixeldreams/headsupp-client@0.1.1`
2. **Integration test depth is still minimal**
   - `apps/headsupp-api/test/integration/` contains only `scaffold.test.js`
3. **Potential high-risk items are real but not quick wins**
   - Connector row still contains `connector_secret` column/value in D1/model.
   - `raw_event_dedupe` primary key is global `idempotency_key`.
   - These require migration/security design and are explicitly deferred out of this closeout story.

Items in the review that are now stale/already improved:

- Subscriber filters by dimensions already shipped.
- Watch update/disable API shipped.
- Alert noise suppression and provisioning reconciliation shipped.
- Email rendering no-id guardrails and debug mode shipped.

## Scope (Quick Wins Only)

- Fix SDK README install command/version references to match current package.
- Add CI guard in SDK repo workflow to fail when README install version and package version diverge.
- Add one meaningful app integration test (non-scaffold) covering:
  - signed event ingest accepted,
  - one alert decision path,
  - one delivery row created/suppressed expectation.
- Add a short "Known deferred hardening" doc section linking deferred stories:
  - connector secret storage hardening,
  - dedupe key scoping migration.

## Out Of Scope (Deferred by design)

- Connector secret schema/storage redesign.
- Dedupe primary key migration.
- Public REST alias surface redesign.
- Large formatting/linting repo-wide sweep.
- TypeScript SDK migration.

## Acceptance Criteria

- SDK README install version and package version are aligned.
- CI check prevents future version drift.
- Integration test suite contains at least one non-scaffold end-to-end behavior test and passes in CI.
- Deferred hardening items are documented with clear follow-up story links.
- No breaking API/SDK behavior changes.

## Test Plan

- Run SDK tests.
- Run API unit + integration tests.
- Run `npm run check` in `apps/headsupp-api`.

## Docs

- Update SDK README and related quickstart snippet(s).
- Add deferred-hardening note in `docs/api/README.md` or `docs/story-execution.md`.

## Done Definition

- Project is closer to closeout with improved consistency and confidence.
- Only backward-compatible improvements shipped.
- High-risk migrations explicitly deferred, not silently mixed into a quick-win pass.
