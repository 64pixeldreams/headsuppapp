# 97 Relative Change Watch Types_done

## Goal

Add relative-change watch types so Heads Up can detect spikes, drops, and previous-period changes from aggregate rows.

## Requirements

- Add percent-change watch types for increases and decreases.
- Add previous-period ratio watch support for “suddenly doubles” style rules.
- Treat zero or missing previous values deterministically.
- Keep watch evaluation aggregate-first.

## Acceptance Criteria

- Percent increase and percent decrease watches evaluate against the two latest aggregate rows.
- Previous-period ratio watches evaluate against the two latest aggregate rows.
- Zero previous values do not create divide-by-zero or infinite alert values.
- Unsupported relative-change configs return non-triggered, explainable evaluations.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run load:smoke
```

## Docs

Update `docs/api/reference.md`, `docs/api/quickstart.md`, `docs/api/spec-alignment-audit.md`, and `docs/api/smoke-test-suite.md`.

## Out Of Scope

Do not build ML or anomaly-baseline detection in this story.
