# Slack Webhook Subscriber_done

## User Story

As a Foretic user, I want to attach my own Slack incoming webhook URL, so Heads Up can send alerts to my Slack channel without Slack OAuth.

## Scope

- Add subscriber URL validation helpers.
- Add Slack webhook subscriber creation service.
- Require workspace/channel ownership checks.
- Store subscriber tenant context.
- Redact destination URLs in returned API shapes.

## Out Of Scope

- Slack OAuth.
- Sending delivery payloads.
- Encrypting destination URLs.
- Full subscriber CRUD.

## Acceptance Criteria

- Given a valid fake Slack webhook URL, subscriber creation succeeds.
- Given a non-HTTPS URL, subscriber creation fails.
- Given a non-Slack URL for `slack_webhook`, subscriber creation fails.
- Given a channel from another workspace, subscriber creation fails.
- Returned subscriber output does not reveal full webhook URL.

## Test Plan

- Unit test Slack URL validator.
- Unit test Slack subscriber creation.
- Unit test invalid URL rejection.
- Unit test cross-workspace rejection.
- Run `npm test`.

## API Documentation

- Update `docs/api/subscribers.md`.

## Implementation Notes

- Use fake Slack webhook URLs in tests.
- Never commit real Slack webhook URLs.
- Store destination URL internally for now; return only a redacted URL.

## Done Definition

- Code implemented.
- Tests added.
- API docs updated.
- `npm test` passes.
- No unrelated changes.

## Status

Done.
