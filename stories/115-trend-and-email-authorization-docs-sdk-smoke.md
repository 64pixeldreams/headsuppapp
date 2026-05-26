# Trend And Email Authorization Docs SDK Smoke

## User Story

As an integrator, I need copy-paste docs, SDK examples, and proof scripts for email authorization and trend watches so I can safely adopt both features.

## Scope

- Update docs and SDK examples for:
  - optional email subscriber authorization,
  - trend up/down watch types,
  - website views trend examples,
  - market feed trend examples.
- Add smoke or proof coverage that demonstrates:
  - pending email subscriber does not receive alerts until confirmed,
  - confirmation enables the subscriber,
  - trend watch detects a useful up/down pattern from aggregate buckets.

## Documentation Requirements

- `docs/api/email-subscribers.md`
  - optional authorization config,
  - confirmation email behavior,
  - expired/month-old link behavior,
  - authorization troubleshooting.
- `docs/api/reference.md`
  - email authorization config props,
  - public confirmation endpoint,
  - `TREND_UP_GT` and `TREND_DOWN_GT`.
- `docs/api/watch-types.md`
  - trend watch catalog entries,
  - recommended bucket/window choices,
  - explanation of first/latest percent trend.
- `docs/api/use-cases.md`
  - website form views trending up/down,
  - market feed trending up/down.
- `docs/api/node-cloudflare-client.md`
  - SDK examples for authorization-required subscriber and trend watch.
- `packages/headsupp-client/README.md`
  - same SDK examples in short form.
- `docs/operations-runbook.md`
  - confirmation-link troubleshooting,
  - trend watch data sufficiency checks.
- `docs/api/smoke-test-suite.md`
  - new/extended proof commands and required env vars.

## Smoke Proof Design

Email authorization proof:

```text
1. Create email subscriber with authorization.required = true.
2. Assert subscriber starts disabled/pending.
3. Send trigger event and assert no email delivery is created for pending subscriber.
4. Confirm via signed test token or public endpoint.
5. Send trigger event and assert delivery can be created.
6. Expired confirmation token does not enable subscriber.
```

Trend proof:

```text
Website form views up
  Send aggregateable events that create a rising day/minute sequence.
  TREND_UP_GT triggers.

Website form views down
  Send aggregateable events that create a falling day/minute sequence.
  TREND_DOWN_GT triggers.

Flat sequence
  Does not trigger.
```

Use shortened bucket windows in smoke scripts if needed for practical runtime, while docs show real product examples such as 3-day, 7-day, and 30-day trends.

## Acceptance Criteria

- Docs are sufficient to configure both features without reading source.
- SDK examples are copy-pasteable and use fake-safe emails/domains.
- Smoke/proof output clearly states what was proven.
- Docs explicitly say authorization is opt-in and trend watches operate over aggregates.
- No real emails, API tokens, connector secrets, or signed tokens are committed.

## Test Plan

- Run `npm run check` from `apps/headsupp-api`.
- Run new/extended smoke scripts when Cloudflare/email env vars are configured.
- Run `git diff --check`.
- Search docs for stale or contradictory watch/action names.

## Platform Alignment

- Follow the existing smoke harness style.
- Keep deployed smoke deterministic and cleanup-safe.
- Prefer D1/API assertions for trend correctness; only use real email delivery where needed for authorization proof.
- Keep feature docs linked from API README, root README, and smoke suite.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: update API docs with endpoint/payload/watch behavior, write focused tests, run proof gates, and keep secrets out of docs/logs/commits.

## Status

Done.
