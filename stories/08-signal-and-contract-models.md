# Signal And Contract Models_done

## Spec Check

Signals describe meaningful streams, and signal contracts make generic incoming event payloads meaningful without hard-coding Foretic internals.

## Scope

- Represent signals and signal contracts in D1 schema.
- Preserve explicit Foretic signal contract creation.
- Keep lazy signal resolution for non-Foretic generic ingest.

## Acceptance Criteria

- `channel_id + signal_key` is unique.
- Signal contracts store JSON configuration.
- Foretic provisioning creates explicit contracts.

## Test Plan

- Existing signal resolution and Foretic forecast watch tests verify explicit and lazy behavior.

## Status

Done.
