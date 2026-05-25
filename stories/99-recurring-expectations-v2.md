# 99 Recurring Expectations V2_done

## Goal

Upgrade missing-expected watches so recurring business events can be checked by due window, entity/dimension, and optional value range.

## Requirements

- Keep current `MISSING_EXPECTED` configs working.
- Add optional due-window configuration.
- Add optional dimension matching through existing `dimensions` config.
- Add optional expected value range checks.
- Preserve alert/recovery behavior through existing alert decision logic.

## Acceptance Criteria

- Existing count-in-window missing-expected watches still pass.
- A recurring payment watch can require at least one matching aggregate in a due window.
- A value below or above an expected range can trigger a missing/invalid expectation alert.
- Late matching data can produce recovery through existing recovery semantics.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
```

## Docs

Update `docs/api/reference.md`, `docs/api/quickstart.md`, and `docs/api/spec-alignment-audit.md`.

## Out Of Scope

Do not add a separate recurrence table unless `config_json` proves insufficient.
