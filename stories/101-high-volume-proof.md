# 101 High Volume Proof_done

## Goal

Add reproducible high-volume proof beyond the current 10,000-event local load smoke.

## Requirements

- Add a configurable high-volume local smoke script.
- Default the script to a practical event count for local development.
- Allow larger runs through environment variables without changing code.
- Document when to run high-volume proof and why it is not part of every normal CI run.

## Acceptance Criteria

- A high-volume script runs with default settings and reports input events, queue messages, aggregate deltas, folded deltas, and unique idempotency keys.
- The event count can be increased with an environment variable.
- The script fails clearly on invalid event counts.
- Documentation explains local proof, optional heavy proof, and CI expectations.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run load:smoke
npm run load:high-volume
```

## Docs

Update `docs/api/smoke-test-suite.md`, `docs/testing-load-and-stress.md`, and `README.md`.

## Out Of Scope

Do not run million-event proof in every CI job.
