# Email Standard Action Buttons

## User Story

As an email alert recipient, I need simple action buttons in the alert email so I can quiet noisy alerts without opening a dashboard.

## Scope

- Add standard email action IDs that can be opted into per email subscriber.
- Configure actions with a simple subscriber config array:

```json
{
  "config": {
    "actions": ["snooze_1h", "snooze_6h", "snooze_1d", "snooze_7d", "stop_watching"]
  }
}
```

- Supported MVP actions:
  - `snooze_1h`
  - `snooze_6h`
  - `snooze_1d`
  - `snooze_7d`
  - `stop_watching`
- Ignore unknown action IDs safely rather than rendering unsafe custom links.
- Render action buttons only when `config.actions` is present and non-empty.
- Keep the action catalog API-owned: labels, durations, token action names, and behavior are controlled by Heads Up, not arbitrary subscriber config.
- Keep threshold editing out of scope for this story. Threshold changes belong behind a later `manage_alert` page.

## Platform Alignment

- Reuse the existing watch action controls model from story 80 for snooze behavior.
- Reuse the email rendering module and template registry added for email subscribers.
- Reuse subscriber `config_json`; no new D1 columns are required for the action list.
- Preserve webhook/slack subscriber behavior.

## Acceptance Criteria

- Email subscriber config can opt into a standard action list.
- Renderer produces compact action controls for allowed action IDs.
- Renderer does not output action controls when the array is absent or empty.
- Unknown action IDs are dropped and do not break email rendering.
- Existing primary CTA still works independently from alert-control action buttons.
- The email render output is deterministic enough for snapshot/string assertions.

## Test Plan

- Unit tests for action config parsing:
  - allowed IDs are preserved in order,
  - unknown IDs are ignored,
  - duplicates are removed,
  - missing/invalid config produces no action buttons.
- Unit tests for renderer output:
  - action labels are uppercase,
  - action URLs are present only when tokens can be generated,
  - primary CTA remains separate from alert controls.
- Run `npm run check` from `apps/headsupp-api`.

## API Documentation

- Update `docs/api/email-subscribers.md` with `config.actions` examples.
- Update `docs/api/reference.md` with allowed email action IDs.
- Update SDK docs/readmes with an email subscriber example that includes action buttons.

## Done Definition

- A subscriber can choose standard email alert actions without custom code.
- No arbitrary action URLs or labels are accepted from external config.
- Docs explain that these are alert controls, not product CTAs.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: keep rendering modular, keep config parsing deterministic, and do not commit real recipient emails or secrets.
- Keep the implementation scoped to email subscribers.
- Run `npm run check` from `apps/headsupp-api`.
- Update docs in the same change.

## Status

Done.
