# 91 Deployed Channel Contract Read Smoke_done

## Goal

Prove channel contracts, signal default inheritance, template watch materialization, and read APIs on the deployed Worker.

## Requirements

- Add a deployed smoke script that uses `/api/function` with a service API key where possible.
- Create a workspace, channel, and active channel contract.
- Create a signal without explicitly duplicating all contract defaults.
- Assert the signal contract inherits channel default dimensions and CTA policy.
- Assert default watch templates materialize as watch rows.
- Send a normal event and assert `admin.getWatchState` returns a recent quiet evaluation timestamp.
- Assert `admin.listChannelAlerts` and `admin.listAlertTimeline` return safe shapes and no secrets.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run smoke:channel-contracts
```

## Docs

Update `docs/api/smoke-test-suite.md`, `docs/api/admin.md`, and `docs/api/cursor-api-instructions.md`.

## Out Of Scope

Do not add AI contract drafting.
