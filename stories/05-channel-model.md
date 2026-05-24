# Channel Model_done

## Spec Check

Channels group related signal streams inside a workspace, such as one Foretic forecast or one machine stream.

## Scope

- Represent channels in D1 schema.
- Preserve channel ownership fields and stable channel keys.

## Acceptance Criteria

- Channels are workspace-scoped.
- `channel_key` is unique.
- Channel lookups can enforce workspace ownership.

## Test Plan

- Existing tenant-scope tests verify channel/workspace relationship checks.
- Foretic forecast watch tests create stable forecast channel keys.

## Status

Done.
