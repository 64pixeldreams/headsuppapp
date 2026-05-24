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

## Status

Pending.
