# 98 Due-Date Reminder Watches_done

## Goal

Add scheduled reminder watch semantics for renewal and due-date alerts.

## Requirements

- Add a scheduled watch type for due-date reminders.
- Store reminder configuration in `watches.config_json`.
- Support “alert N days/hours/minutes before due date.”
- Record watch state when a reminder is not due.
- Persist alert and delivery rows when a reminder becomes due.

## Acceptance Criteria

- A reminder watch before the lead window stays quiet and records state.
- A reminder watch inside the lead window creates one alert subject to existing cooldown/action controls.
- Past due reminders can still alert until explicitly outside configured behavior.
- Scheduled tasks include reminder evaluation.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
```

## Docs

Update `docs/api/reference.md`, `docs/api/quickstart.md`, and `docs/api/connectors-and-ingest.md`.

## Out Of Scope

Do not build calendar integrations or recurring renewal importers in this story.
