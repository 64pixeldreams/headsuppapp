# Email Action Buttons Docs And Smoke

## User Story

As an integrator, I need copy-paste docs and a deployed proof so I can confidently enable email action buttons for recipients.

## Scope

- Update public/API/SDK docs for email action buttons.
- Add or extend a deployed smoke proof for email action rendering and safe action execution.
- Document operational behavior for old links, expired links, repeated clicks, and stop-watching confirmation.

## Required Docs

- `docs/api/email-subscribers.md`
  - how to configure `config.actions`,
  - allowed action IDs,
  - what each action does,
  - expiry and repeated-click behavior,
  - warning that threshold editing is not included in MVP.
- `docs/api/reference.md`
  - email subscriber `config.actions`,
  - public action endpoint shape.
- `docs/api/node-cloudflare-client.md`
  - SDK create-subscriber example with action buttons.
- `packages/headsupp-client/README.md`
  - same subscriber config example.
- `docs/operations-runbook.md`
  - troubleshooting expired/invalid action links.
- `docs/api/smoke-test-suite.md`
  - smoke coverage and required env vars.

## Smoke Proof

Extend or add an email action smoke that proves:

```text
1. Email subscriber is provisioned with action buttons.
2. Trigger event creates one sent email delivery.
3. Rendered email payload includes configured action labels/links.
4. Snooze action link applies the expected watch action control.
5. Reusing the same action link is idempotent.
6. Expired/tampered token does not mutate state.
```

If real email content cannot be fetched from the provider, assert the rendered payload before send or expose a safe test hook that does not leak recipient data.

## Acceptance Criteria

- Integrators can configure action buttons from docs without reading source.
- Smoke coverage proves both rendering and action execution.
- Docs clearly explain month-old link behavior: expired links fail closed and do not change watch state.
- Docs clearly separate MVP actions from future threshold editing/manage-alert UI.

## Test Plan

- Run `npm run check` from `apps/headsupp-api`.
- Run the new/extended email action smoke when Cloudflare and email env vars are configured.
- Run `git diff --check`.
- Search docs for stale or contradictory action names.

## Done Definition

- Docs and smoke coverage are good enough for release use.
- No real recipient lists, Cloudflare tokens, or signed action tokens are committed.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: keep docs copy-pasteable and examples secret-safe.
- Do not expose signed token internals in public docs beyond behavior and expiry expectations.
- Run docs validation searches before marking done.

## Status

Done.
