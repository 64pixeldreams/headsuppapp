# Email Debug Render Mode

Status: implemented.

Implemented in:

- `apps/headsupp-api/src/services/email/render-alert-email.js`
- `apps/headsupp-api/test/unit/email-renderer.test.js`
- `docs/api/email-rendering.md`
- `docs/api/reference.md`
- `docs/public-sdk/cookbook/email-alerts.md`

## User Story

As an integrator support team, I want Heads Up email rendering to optionally show event/debug ids in a controlled debug area, so support can trace an email back to a source resource or event without putting opaque ids in customer-facing copy.

## Why This Matters

Heads Up should keep ids out of visible customer copy (`title`, subtitle, `summary`, `detail`) while still supporting production debugging. Integrators should not need to hack values like `oracle_forecast:<token>` into `forecast_name` or `notification.summary` just to trace an email.

This is a rendering concern and belongs in Heads Up.

## Field Contract

Events may include:

```json
{
  "fields": {
    "debug": {
      "id": "oracle_forecast:mn9cxnv3muoleo",
      "event_ref": "foretic:oracle_forecast:mn9cxnv3muoleo:forecast_state:2026-05-29T12:00:00Z",
      "mode": "debug"
    }
  }
}
```

Accepted fields:

```text
fields.debug.id         primary resource/debug id
fields.debug.event_ref  event/idempotency/debug reference
fields.debug.mode       "debug" enables debug render for this event
```

## Toggle Rules

Debug rendering is enabled if either is true:

- `subscriber.config.debug === true`
- `fields.debug.mode === "debug"`

Default is off.

## Rendering Rules

Debug off:

- Ignore `fields.debug`.
- Never render debug values in HTML or text output.

Debug on:

- Render a discreet debug line near the email footer/body utility area, e.g.

```text
Debug: oracle_forecast:mn9cxnv3muoleo · evt foretic:...
```

- Add an optional subject suffix by default:

```text
Forecast pace alert: 139% [oracle_forecast:mn9cxnv3muoleo]
```

- Allow `subscriber.config.debug_subject === false` to suppress the subject suffix while keeping the footer debug line.
- Escape all debug values like normal dynamic text.
- Never render `debug.id` in `title`, header subtitle, `summary`, or `detail`, even when debug is enabled.

## Scope

- Email renderer only (`render-alert-email.js`).
- Text and HTML email output.
- Subject suffix.
- Unit tests.
- API/SDK docs for the event field and subscriber config.

## Out Of Scope

- Slack/webhook debug rendering.
- Admin UI toggle.
- Database schema changes.
- Arbitrary debug object rendering. Only `id` and `event_ref` are shown in v1.
- Replacing `admin.traceEvent`.

## Acceptance Criteria

- With debug off, `fields.debug.id` and `fields.debug.event_ref` do not appear in subject, HTML, or text.
- With `subscriber.config.debug = true`, the debug footer line appears and subject suffix appears.
- With `fields.debug.mode = "debug"`, the same debug rendering appears for that event.
- With `subscriber.config.debug_subject = false`, footer line appears but subject suffix does not.
- Debug values are escaped.
- Existing no-id-in-copy guardrail remains: debug id does not become title/subtitle/summary/detail.

## Test Plan

- Unit test debug-off suppression.
- Unit test subscriber-config debug mode.
- Unit test event debug mode.
- Unit test `debug_subject: false`.
- Unit test escaping.
- Run `npm run check` from `apps/headsupp-api`.

## Docs

- Update `docs/api/email-rendering.md` or `docs/api/reference.md` with `fields.debug`.
- Update SDK email cookbook/troubleshooting docs with internal test inbox example:

```json
{
  "config": {
    "debug": true,
    "debug_subject": true
  }
}
```

## Done Definition

- Integrators can safely include debug ids in event payloads without leaking them into customer copy.
- Internal/test recipients can opt into debug rendering.
- Tests and docs are updated.
