# Slack And Webhook Delivery Polish

Status: implemented.

Implementation:

- Slack renderer: `apps/headsupp-api/src/services/delivery/slack-alert.js`
- Slack/webhook dispatcher: `apps/headsupp-api/src/services/delivery/webhook.js`
- Unit tests: `apps/headsupp-api/test/unit/webhook-delivery.test.js`
- Docs: `docs/api/subscribers.md`, `docs/api/webhook-receivers.md`, `docs/api/alerts-and-deliveries.md`, `docs/api/smoke-test-suite.md`

## User Story

As a Heads Up integrator, I need email, Slack, and webhook deliveries to each be useful in their native context, so customer users get polished human-facing alerts in email and Slack while developers and AI agents receive controlled, structured webhook payloads.

## Why This Matters

Email is now polished and production-proven. Slack should feel equally user-ready for customer teams: readable, branded enough, actionable, and consistent with the alert meaning in email. Generic webhooks should stay simple and machine-readable, with predictable payloads and controlled alert delivery rates for developer systems, automations, and AI agents.

This story checks and upgrades delivery surfaces after the email production pass:

```text
email    -> polished human-facing HTML/text alerts
slack    -> polished human-facing Slack messages
webhook  -> structured developer/agent payloads with controlled alert rate
```

## Scope

### 1. Slack Template Renderer

Add a Slack renderer that mirrors the email renderer conceptually, but emits Slack-native payloads.

Requirements:

- Support Slack incoming webhook delivery through existing Slack subscribers.
- Add template IDs such as `base_alert_slack_v1` and, if useful, `forecast_alert_slack_v1`.
- Render a polished Slack message with:
  - severity-aware title;
  - human-readable summary;
  - current value and threshold;
  - signal/watch/channel context where useful;
  - CTA link when present;
  - action links when supported by existing email action-token infrastructure;
  - concise footer/brand/source line.
- Support per-subscriber `config_json` overrides similar to email:
  - `template_id`;
  - `labels.title_template`;
  - `labels.summary_template`;
  - limited `branding` or `source_label` fields appropriate for Slack.
- Avoid HTML concepts in Slack. Use Slack Block Kit or a clean incoming-webhook-compatible payload.
- Keep the fallback simple text payload for compatibility if a Slack template cannot be rendered.

### 2. Human Parity With Email

Slack does not need to look like email, but it must convey the same user-facing alert meaning.

The same alert should clearly show:

```text
what happened
how severe it is
what value fired
what threshold or expected value mattered
which resource/channel/signal it belongs to
what the user can click next
```

Add tests that compare email and Slack render inputs to ensure Slack does not drop core user-facing fields.

### 3. Developer Webhook Contract

Review the generic webhook payload and improve docs/tests where needed.

Requirements:

- Keep webhooks structured JSON, not visual templates.
- Ensure payload includes stable developer fields:
  - `type`;
  - `alert_id`;
  - `workspace_id`;
  - `channel_id`;
  - `signal_id`;
  - `watch_id`;
  - `severity`;
  - `summary`;
  - `current_value`;
  - `threshold_value`;
  - `triggered_at`;
  - `fields`;
  - `cta`;
  - channel metadata.
- Document webhook use for developer systems, AI agents, and API automation.
- Document that alert delivery rate is controlled by watches, grouped policies, cooldowns, recovery, and subscriber filters.
- Do not add UI styling to generic webhooks.

### 4. Rate And Safety Review

Review Slack and webhook delivery behavior for safe production use.

Requirements:

- Confirm Slack and webhook subscribers honor existing watch cooldowns, grouped winner selection, recovery behavior, and subscriber filters.
- Add or update tests for duplicate suppression where Slack/webhook delivery could otherwise spam.
- Document recommended cooldown/filter settings for AI agents and external APIs.
- Confirm secrets/webhook URLs are redacted in docs, smoke output, and read APIs.

### 5. Smoke Tests

Add or update smoke coverage so operators can prove all delivery surfaces.

Minimum proof:

```text
email    existing real/inbox proof remains green
slack    one polished Slack message with expected user-facing fields
webhook  one structured JSON payload with expected developer fields
```

If possible, add one combined smoke that provisions one alert and routes it to Slack and webhook subscribers, then asserts both deliveries reached `sent`.

### 6. Documentation

Update docs so an integrator can choose and configure delivery channels without guessing.

Required docs:

- `docs/api/subscribers.md`
- `docs/api/webhook-receivers.md`
- `docs/api/alerts-and-deliveries.md`
- `docs/api/smoke-test-suite.md`
- SDK/public docs where subscriber examples are shown.

Docs must explain:

```text
email: polished customer/user inbox alerts
slack: polished customer/team chat alerts
webhook: structured developer/API/AI-agent delivery
```

Include examples for:

- Slack subscriber config with template/labels;
- generic webhook subscriber config;
- recommended cooldown and filters for AI agents;
- when to use Slack vs email vs webhook.

## Acceptance Criteria

- Slack delivery has a template renderer and sends polished, user-facing alert messages.
- Slack messages preserve the same core meaning as email alerts.
- Generic webhook payload is documented and tested as the simple developer/agent contract.
- Slack and webhook delivery behavior respects existing watch cooldowns, groups, recovery, and subscriber filters.
- Smoke or unit coverage proves Slack and webhook delivery outputs.
- Documentation makes the three delivery surfaces easy to choose and use.
- No customer secrets, Slack webhook URLs, or API keys are committed.
