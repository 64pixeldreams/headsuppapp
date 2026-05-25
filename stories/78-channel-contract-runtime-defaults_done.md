# Channel Contract Runtime Defaults

## User Story

As a platform owner, I need channel contracts to influence runtime normalization and watch bootstrap so channels behave consistently by design.

## Scope

- Apply channel contract defaults when creating signals/watches.
- Inherit default dimensions and CTA policy into signal contracts.
- Add watch-template expansion from channel contract into watch rows.

## Acceptance Criteria

- Signal creation in a contracted channel inherits default dimensions.
- Contract watch templates can materialize into active watches.
- Runtime keeps backward compatibility for channels without contracts.

## Test Plan

- Unit tests for default inheritance.
- Integration test: channel contract -> signal/watch materialization.
- Run `npm run check`.

## API Documentation

- Update `docs/api/connectors-and-ingest.md`.
- Update `docs/api/admin.md`.

## Done Definition

- Contract defaults are active in runtime paths.
- Legacy non-contracted channels continue to work.
- Story is renamed with `_done` only after all Cursor rules and proof gates pass.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: build this story independently, keep runtime code modular, and use direct D1/Queue/DO/Cron patterns for hot paths instead of forcing aggregation through CFKit DataModel.
- Write focused tests for inheritance, materialization, and backward compatibility.
- Run `npm run check` from `apps/headsupp-api`.
- Run `npm run load:smoke` because this changes normalization/watch setup behavior.
- Run deployed smoke tests affected by watch creation/defaults: `npm run smoke:generic-slack`, `npm run smoke:alert-decisions`, and `npm run smoke:foretic` when runtime credentials are available.
- Update API docs in the same change and confirm no secrets are committed.

## Status

Done.
