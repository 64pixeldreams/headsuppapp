# Signal Resolution And Contracts_done

## Spec Check

`SPEC_BREIF.md` says unknown `signal_key` values can lazily create signals with defaults, while Foretic setup creates signal contracts explicitly. Contracts define dimensions, default bucket types, and default aggregate.

## Scope

- Resolve signal by `channel_id + signal_key`.
- Lazily create default metric signals when missing.
- Resolve or create default signal contracts.
- Parse contract JSON safely.

## Test Plan

- Unit test existing signal/contract resolution.
- Unit test lazy signal and default contract creation.

## Status

Done.
