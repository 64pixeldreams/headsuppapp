# Real Email Watch Proof Suite

## User Story

As the Heads Up operator, I need runnable deployed tests that send real emails to `martin@inc64.com` across alert and watch types, so we can prove the production delivery path works before calling the API platform ready.

## Why This Matters

Unit tests and D1 assertions prove logic, but they do not prove the full user-visible path:

```text
provision -> signed ingest -> queue -> aggregate -> watch evaluation -> alert persistence -> email render -> Cloudflare Email send
```

For production readiness, Heads Up needs an explicit, repeatable real-email proof suite that can be run manually before launch and optionally from a controlled CI/manual workflow.

## Scope

Add one or more smoke scripts that send real emails to:

```text
martin@inc64.com
```

The suite must provision deterministic test resources, trigger each supported watch family, and assert D1 delivery state after Cloudflare Email sends.

Do not run this proof automatically on every PR. It sends real email and should be opt-in/manual.

## Required Commands

Add package scripts such as:

```text
npm run smoke:email-real
npm run smoke:watch-email-matrix
```

The exact names can vary, but docs must include one obvious command for the full production email proof.

## Environment

Required:

```text
CLOUDFLARE_API_TOKEN
HEADSUPP_SMOKE_EMAIL_DESTINATION=martin@inc64.com
```

Optional:

```text
HEADSUPP_SMOKE_BASE_URL
HEADSUPP_SMOKE_D1_DATABASE_ID
HEADSUPP_SMOKE_KV_NAMESPACE_ID
HEADSUPP_SMOKE_SERVICE_API_KEY
HEADSUPP_REAL_EMAIL_PROOF_RUN_ID
HEADSUPP_REAL_EMAIL_PROOF_COOLDOWN_SECONDS=0
```

The scripts must refuse to run unless `HEADSUPP_SMOKE_EMAIL_DESTINATION` is set. Defaulting to a real address in source is not allowed.

## Real Email Proof Coverage

### Email Rendering And Delivery

Prove:

- base alert email template renders and sends;
- `forecast_alert_v1` renders with rich fields and sends;
- CTA/action buttons render without breaking delivery;
- delivery row reaches `sent`;
- delivery attempts include response state useful for debugging;
- email subscriber authorization state is respected if authorization is enabled.

### Watch Types That Must Fire Emails

At minimum, trigger one real email for each watch family:

- `LAST_VALUE_GT`
- `LAST_VALUE_LT`
- `WINDOW_SUM_GT`
- `WINDOW_COUNT_GT`
- `DELTA_GT`
- `DELTA_LT`
- `RELATIVE_CHANGE_GT`
- `RELATIVE_CHANGE_LT`
- `TREND_UP_GT`
- `TREND_DOWN_GT`
- `MISSING_EXPECTED`
- reminder watch
- grouped watch policy where critical wins over warning
- recovery email when a recovering watch returns to normal, if recovery email delivery is enabled

If a watch type is not expected to send an email directly, document why and assert the correct alternate behavior.

### Subscriber Routing Proof

Prove:

- unfiltered recipient receives eligible alerts;
- `config.filters.signal_keys` routes only selected signals;
- `config.filters.watch_group_keys` routes only selected groups;
- `config.filters.band_keys` routes warning/critical/recovery selections;
- non-matching recipient does not get delivery rows.

### Cooldown And Duplicate Proof

Prove:

- first crossing sends;
- repeat crossing during cooldown does not send;
- debug output identifies cooldown suppression;
- with `cooldown_seconds: 0`, repeated test events can be used safely for manual proof;
- grouped warning/critical watches create only one winning email.

## Script Design

Use deterministic but run-scoped IDs:

```text
workspace_key = smoke:real_email:<run_id>
channel_key = smoke:real_email:<run_id>:<case>
connector_key = ck_smoke_real_email_<run_id>_<case>
subscriber_key = smoke_real_email_martin_<run_id>
```

For each case:

1. Provision workspace/channel/connector/signals/watches/subscribers.
2. Use fresh `idempotency_key` values.
3. Use `occurred_at` close to now.
4. Send signed ingest events.
5. Poll for alert and delivery state.
6. Assert exactly the expected number of alerts and email deliveries.
7. Print a compact JSON summary containing:
   - run id;
   - case name;
   - watch type;
   - alert id;
   - delivery id;
   - delivery status;
   - email destination redacted;
   - whether a human email should have arrived.

## Safety Rules

- Use only `martin@inc64.com` or an explicitly supplied `HEADSUPP_SMOKE_EMAIL_DESTINATION`.
- Never commit secrets, connector secrets, signed tokens, or raw email provider responses.
- Prefix all subjects/summaries with `[Heads Up Smoke]`.
- Use a unique run id so repeated runs are easy to find and cleanup.
- Use `cooldown_seconds: 0` for trigger-matrix cases unless the case specifically tests cooldown.
- Include cleanup instructions, but do not delete proof rows by default.

## API Documentation Requirements

Update:

```text
docs/api/smoke-test-suite.md
docs/final-smoke-runbook.md
docs/operations-runbook.md
docs/api/email-subscribers.md
docs/api/watch-types.md
docs/api/alerts-and-deliveries.md
```

Docs must explain:

- when to run real-email proof;
- required env vars;
- expected number of emails;
- how long to wait;
- how to inspect failed delivery rows;
- how cooldown affects manual retests;
- how to avoid spamming real users.

## SDK Documentation Requirements

Update:

```text
docs/public-sdk/cookbook/email-alerts.md
docs/public-sdk/watch-types.md
docs/public-sdk/client-reference.md
packages/headsupp-client/README.md
```

SDK docs must include:

- a real-email test recipe using a safe test recipient;
- watch matrix examples that match the smoke suite payloads;
- note that production apps should not send smoke emails to customer recipients.

## Tests

- Unit tests for any reusable smoke helpers.
- Script-level dry-run mode that builds/provisions payloads without sending real email where practical.
- Real deployed smoke run with `HEADSUPP_SMOKE_EMAIL_DESTINATION=martin@inc64.com`.
- D1 assertions that every expected delivery reached `sent`.
- Negative assertions for filtered-out subscribers and cooldown suppression.

## Acceptance Criteria

- A single documented command can send real proof emails to `martin@inc64.com`.
- The command proves the full production email path for each supported watch family.
- The command exits non-zero if any expected email delivery is missing, retrying, failed, filtered incorrectly, or duplicated.
- The output is compact enough to paste into a release note or customer proof.
- API docs, SDK docs, and smoke suite docs all describe the same command and env vars.
- The proof can be run before declaring the API platform production-ready.

## Test Plan

Run from `apps/headsupp-api`:

```bash
npm run check
HEADSUPP_SMOKE_EMAIL_DESTINATION=martin@inc64.com npm run smoke:email-real
HEADSUPP_SMOKE_EMAIL_DESTINATION=martin@inc64.com npm run smoke:watch-email-matrix
```

If the implementation uses a single combined command, run that command instead and document it in the smoke suite.

## Status

Done.
