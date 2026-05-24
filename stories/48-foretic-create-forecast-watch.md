# Foretic Create Forecast Watch_done

## User Story

As Foretic, I want one provisioning call that turns "Watch this forecast" into Heads Up resources, so Foretic can emit forecast state events and Heads Up can later alert subscribers.

## Scope

- Register `foretic.createForecastWatch` as a CFKit CloudFunction.
- Require `foretic:provision`.
- Use Foretic `user_id` as the temporary tenant boundary when no tenant exists.
- Find or create the Foretic workspace.
- Create an idempotent forecast channel.
- Create an idempotent webhook connector for that channel.
- Create a `forecast.revenue.pace` signal contract.
- Create default warning, critical, and recovery watch definitions.
- Optionally create Slack and Foretic callback webhook subscribers.

## Out Of Scope

- Runtime watch evaluation.
- Alert delivery dispatch.
- Aggregate forwarding execution.
- Slack OAuth.
- D1 schema migration.

## Acceptance Criteria

- Given a valid Foretic fixture, the call creates workspace, channel, connector, signal contract, watches, and requested subscribers.
- Given the same fixture twice, stable resource ids are returned and the connector secret is not re-shown on the second call.
- Given no Slack URL, only the Foretic callback subscriber is created when present.
- Given invalid Slack URL, provisioning fails before storing Slack subscriber output.
- Given missing forecast id, provisioning fails.

## Test Plan

- Unit test full forecast watch provisioning.
- Unit test idempotent repeat provisioning.
- Unit test missing forecast id rejection.
- Unit test invalid Slack URL rejection.
- Run `npm test`.

## API Documentation

- Update `docs/api/foretic-provisioning.md`.
- Update `docs/api/connectors-and-ingest.md`.

## Implementation Notes

- Store connector secret internally and return it only when the connector is first created.
- Do not store real Slack webhook URLs in tests or docs.
- Keep the resource setup modular and reusable.

## Done Definition

- Code implemented.
- Tests added.
- API docs updated.
- `npm test` passes.
- No unrelated changes.

## Status

Done.
