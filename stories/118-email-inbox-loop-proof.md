# Email Inbox Loop Proof

Status: implemented.

Implementation:

- main API migration: `apps/headsupp-api/migrations/0009_email_test_messages.sql`
- main API receipt endpoint: `POST /internal/email/test-receipts`
- main API test-mode email JSON: `subscriber.config_json.email_test.enabled`
- inbound worker: `apps/headsupp-email-worker`
- live smoke: `cd apps/headsupp-api && npm run smoke:email-inbox-loop`

## User Story

As the Heads Up operator, I need an automated email proof loop that confirms test emails are actually received and that their JSON payloads match the alert that fired, so deploy validation proves the email platform still works without flooding a real inbox.

## Why This Matters

The current real-email proof proves Heads Up can render emails and that Cloudflare Email accepted the send. It does not fully prove that a controlled inbox received the message, parsed it, and matched the expected alert payload.

Production readiness needs a safer loop with a dedicated Email Worker:

```text
trigger test alert
  -> send test-mode email to controlled Cloudflare inbound address
  -> headsupp-email-worker receives it through Cloudflare Email Routing
  -> email worker parses/normalizes the message
  -> email worker sends a signed payload to the main Heads Up API
  -> Heads Up message log records received/tested/payload_matched
  -> smoke script polls the message log until every case is proven
```

Keep one deliberate human-facing email to `martin@inc64.com` for visual layout/brand inspection. All broad watch-matrix proof should use the automated inbox loop.

## Scope

### 1. Single Inc64 Visual Email Proof

Add a small manual smoke that sends exactly one controlled visual proof email to:

```text
martin@inc64.com
```

It must prove:

- standard template renders;
- custom branding JSON renders;
- logo URL renders;
- custom icon or severity icon renders;
- CTA/action button layout renders;
- footer/brand/company line renders;
- `forecast_alert_v1` or equivalent rich template layout is visually inspectable.

The subject/summary must be clearly marked:

```text
[Heads Up Visual Smoke]
```

This command must require explicit env:

```text
HEADSUPP_SMOKE_EMAIL_DESTINATION=martin@inc64.com
```

Do not run it automatically on every deploy.

### 2. Automated Inbox Loop For Watch Types

Add a controlled test inbox path:

```text
HEADSUPP_EMAIL_TEST_INBOX_ADDRESS=tester@aibox.headsupp.io
```

Cloudflare Email Routing route:

```text
zone: headsupp.io
route/address: tester@aibox.headsupp.io
email worker: headsup_email_worker
```

Each watch-type smoke sends a JSON test email payload to that inbox. The payload must include enough structured data to prove correctness:

```json
{
  "test": true,
  "run_id": "email-proof-...",
  "case_id": "last_value_gt",
  "watch_type": "LAST_VALUE_GT",
  "signal_key": "smoke.email.last_value_gt",
  "current_value": 15,
  "threshold_value": 10,
  "severity": "warning",
  "alert_id": "alert_...",
  "delivery_id": "delivery_...",
  "expected": {
    "current_value": 15,
    "threshold_value": 10,
    "severity": "warning"
  }
}
```

The inbound email handler must parse the JSON payload and write a durable proof row.

### 3. Message Log

Add a small D1-backed test message log, for example:

```sql
CREATE TABLE email_test_messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  alert_id TEXT,
  delivery_id TEXT,
  recipient TEXT NOT NULL,
  expected_json TEXT NOT NULL,
  received_json TEXT,
  status TEXT NOT NULL,
  sent_at TEXT,
  received_at TEXT,
  tested_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Minimum statuses:

```text
created
sent
received
tested
failed
```

The log should not contain secrets. It may store test JSON and redacted recipient metadata.

### 4. Separate Email Worker And Inbound Monitor

Add a separate Cloudflare Email Worker, for example:

```text
apps/headsupp-email-worker
deployed worker name: headsup_email_worker
```

The Email Worker follows Cloudflare Email Routing's Email Workers model:

```js
export default {
  async email(message, env, ctx) {
    // message.from, message.to, message.headers, message.raw, message.rawSize
  },
};
```

Reference:

```text
https://developers.cloudflare.com/email-routing/email-workers/
```

Cloudflare Email Routing binds the controlled test inbox address to this Email Worker. The email worker then posts a normalized, signed inbound payload to the main Heads Up API.

Email worker responsibilities:

- accept only the configured test inbox address;
- reject/ignore normal customer emails;
- parse the raw email from `message.raw`;
- extract the JSON test payload from the text body or a dedicated JSON part;
- normalize sender, recipient, subject, message id, received timestamp, and raw size;
- sign a POST to the main Heads Up API with a shared secret;
- never write directly to Heads Up D1 unless the email worker intentionally shares that binding in a local/dev-only mode.

Main Heads Up API responsibilities:

- expose an internal endpoint or admin action for inbound email test receipts;
- verify the email worker signature;
- validate `run_id`, `case_id`, `alert_id`, and expected values;
- update `email_test_messages.status = tested` when payload matches;
- record `failure_reason` when parsing or matching fails.

Recommended secret:

```text
HEADSUPP_EMAIL_WORKER_WEBHOOK_SECRET
```

Normalized payload shape:

```json
{
  "type": "email.test.received",
  "message_id": "<cloudflare-or-mime-message-id>",
  "to": "headsupp-email-test@inc64.com",
  "from": "alerts@headsupp.io",
  "subject": "[Heads Up Smoke] LAST_VALUE_GT",
  "received_at": "2026-05-28T00:00:00.000Z",
  "raw_size": 12345,
  "payload": {
    "test": true,
    "run_id": "email-proof-...",
    "case_id": "last_value_gt",
    "alert_id": "alert_...",
    "delivery_id": "delivery_..."
  }
}
```

If Cloudflare Email Routing cannot be enabled yet, implement the email worker, the signed API contract, and the message-log endpoints, but mark the live inbound route as a deployment prerequisite. Do not fake "received" in the same process that sent the email.

### 5. Watch Type Coverage

The automated inbox-loop smoke must cover all email-producing watch families:

- `LAST_VALUE_GT`
- `LAST_VALUE_LT`
- `WINDOW_SUM_GT`
- `WINDOW_COUNT_GT`
- `DELTA_GT`
- `DELTA_LT`
- `PERCENT_CHANGE_GT`
- `PERCENT_CHANGE_LT`
- `TREND_UP_GT`
- `TREND_DOWN_GT`
- `MISSING_EXPECTED`
- `REMINDER_DUE`
- `DIGEST`
- grouped watch policy with `highest_severity_wins`
- recovery email, if recovery delivery is enabled

For each case, assert:

- alert row was created;
- email delivery row reached `sent`;
- inbound test inbox received the JSON email;
- parsed JSON matches expected current value, threshold, severity, watch type, signal key, and case id;
- message log status became `tested`.

### 6. Commands

Add:

```text
npm run smoke:email-visual
npm run smoke:email-inbox-loop
```

Recommended release proof:

```bash
HEADSUPP_EMAIL_TEST_INBOX_ADDRESS=... npm run smoke:email-inbox-loop
```

Optional human visual check:

```bash
HEADSUPP_SMOKE_EMAIL_DESTINATION=martin@inc64.com npm run smoke:email-visual
```

## API Documentation Requirements

Update:

```text
apps/headsupp-email-worker/README.md
docs/api/smoke-test-suite.md
docs/final-smoke-runbook.md
docs/operations-runbook.md
docs/api/email-subscribers.md
docs/api/email-rendering.md
docs/api/alerts-and-deliveries.md
docs/api/schema-and-migrations.md
docs/api/openapi.yaml
```

Docs must explain:

- why inbox-loop proof is stronger than provider-accepted proof;
- how to configure the test inbox address;
- how to configure the Cloudflare Email Routing route to the email worker;
- how to configure `HEADSUPP_EMAIL_WORKER_WEBHOOK_SECRET`;
- how to read `email_test_messages`;
- how to troubleshoot `sent` but not `received`;
- how to troubleshoot `received` but payload mismatch;
- why the broad matrix must not target real human inboxes.

## SDK Documentation Requirements

Update:

```text
docs/public-sdk/cookbook/email-alerts.md
docs/public-sdk/client-reference.md
packages/headsupp-client/README.md
packages/headsupp-client/CHANGELOG.md
```

SDK docs should describe the inbox-loop proof as an operator/release test, not a customer app feature.

## Safety Rules

- The watch-matrix proof must not send dozens of emails to `martin@inc64.com`.
- Only `smoke:email-visual` may send a human visual email.
- The inbox-loop proof must clean up or disable recurring/scheduled test watches after completion or failure.
- Scheduled test watches must always have cleanup in `finally`.
- Every smoke email subject must include `[Heads Up Smoke]` or `[Heads Up Visual Smoke]`.
- No secrets, connector secrets, or raw provider credentials in logs or D1 test rows.

## Acceptance Criteria

- One manual visual email proves standard/custom branding and layout.
- A separate Email Worker receives the controlled inbox message through Cloudflare Email Routing.
- The Email Worker posts a signed normalized receipt to the main Heads Up API.
- Automated inbox-loop proof covers all watch families listed above.
- Each automated case reaches `email_test_messages.status = tested`.
- Payload matching verifies the fired alert values, signal key, watch type, severity, alert id, and delivery id.
- The smoke exits non-zero if any expected email is not received or does not match.
- The proof is safe to run after every deploy without flooding a human inbox.
- Docs and SDK docs point operators to this proof as the preferred production readiness test.

## Test Plan

Run from `apps/headsupp-api`:

```bash
npm run check
HEADSUPP_EMAIL_TEST_INBOX_ADDRESS=<test-inbox@...> npm run smoke:email-inbox-loop
HEADSUPP_SMOKE_EMAIL_DESTINATION=martin@inc64.com npm run smoke:email-visual
```

Also verify failure behavior:

```text
bad inbox payload -> status failed with failure_reason
missing inbound message -> smoke times out and disables scheduled resources
payload mismatch -> smoke exits non-zero and records mismatch
```

## Status

Pending.
