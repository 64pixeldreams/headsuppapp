# 90 Deployed Watch Action Controls Smoke_done

## Goal

Prove snooze, mute, resume, and ignore behavior against the deployed Worker.

## Requirements

- Add a deployed smoke script that provisions a deterministic Slack-backed alert watch.
- Trigger an initial alert and confirm the delivery is sent.
- Snooze the watch through `admin.snoozeWatch`; trigger again and assert no new Slack delivery.
- Resume the watch through `admin.resumeWatch`; trigger again after a safe state transition and assert delivery can resume.
- Mute the watch through `admin.muteWatch`; assert recovery or alert notifications are suppressed.
- Ignore a pending/retrying alert through `admin.ignoreAlert`; assert eligible deliveries become `ignored`.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run smoke:action-controls
```

## Docs

Update `docs/api/smoke-test-suite.md`, `docs/api/alerts-and-deliveries.md`, and `docs/api/reference.md`.

## Out Of Scope

Do not add dashboard controls or Slack OAuth.
