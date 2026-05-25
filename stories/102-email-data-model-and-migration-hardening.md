# Email Data Model And Migration Hardening

## Scope

- Ensure `subscribers` supports email config in `config_json`.
- Add deterministic `normalized_destination` for lookup/uniqueness.
- Add indexes for subscriber lookup (`channel_id`, `mode`, `subscriber_type`, `normalized_destination`).
- Prove no regressions for webhook/slack subscribers.

## Acceptance

- Email subscriber creation persists normalized destination.
- Disable/delete lookup by email+mode is deterministic.
- Existing subscriber flows remain unchanged.

## Status

In progress.
