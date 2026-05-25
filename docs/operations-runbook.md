# Heads Up Operations Runbook

This runbook is for operating the API-only Heads Up service. It focuses on deployed smoke failures, queue/delivery issues, D1 problems, cron failures, and Worker exceptions.

## Safety Rules

```text
do not commit Cloudflare tokens
do not commit Slack webhook URLs
do not commit connector secrets or API keys
do not edit production D1 manually unless it is an explicit break-glass action
prefer documented scripts and migrations over one-off SQL
```

## First Checks

```powershell
cd apps/headsupp-api
npm run check
npm run load:smoke
```

Then inspect deployed health:

```powershell
curl https://headsupp_app.martin-598.workers.dev/health
curl -H "Authorization: Bearer <operator token>" https://headsupp_app.martin-598.workers.dev/api/v1/observability/overview
```

The observability response is safe for operators. It must not include raw event payloads, connector secrets, API keys, or full webhook URLs.

## First API Key Or Key Rotation

The first service API key is created with `operator.bootstrapServiceApiKey` and the runtime Worker secret `HEADSUPP_BOOTSTRAP_TOKEN`. See [docs/api/getting-started-api-keys.md](api/getting-started-api-keys.md) for the exact request.

If bootstrap fails:

```text
confirm HEADSUPP_BOOTSTRAP_TOKEN is set as a Worker secret
confirm the request sends X-HeadsUp-Bootstrap-Token or a valid operator Bearer token
confirm the new key has the permissions needed by the integration
do not paste raw api_key values into logs, docs, issues, or commits
```

Key lifecycle actions are `operator.listServiceApiKeys`, `operator.rotateServiceApiKey`, and `operator.revokeServiceApiKey`. Rotation returns the new raw key once.

## Failed Deployed Smoke

Check:

```text
which smoke failed
whether CLOUDFLARE_API_TOKEN is present at runtime
whether HEADSUPP_SMOKE_SLACK_WEBHOOK_URL is present for Slack smokes
whether D1 migration has been applied remotely
whether the Worker was deployed after code changes
```

Useful commands:

```powershell
npm run smoke:generic-slack
npm run smoke:alert-decisions
npm run smoke:scheduled
npm run smoke:delivery-retry
npm run smoke:tenant-isolation
npm run smoke:quiet-summary
npm run smoke:action-controls
npm run smoke:channel-contracts
npm run smoke:aggregate-forward-dimensions
npm run smoke:advanced-watches
npm run smoke:email-subscriber
npm run smoke:operator-observability
```

If a smoke fails after provisioning, rerun once after checking Worker logs. Do not repeatedly run failing smokes without reading the error because deterministic smoke resources may keep the same IDs.

## Queue Backlog Or Consumer Failure

Symptoms:

```text
ingest returns 202 but aggregates do not change
alerts are not created after aggregate-triggering events
delivery rows stay pending
```

Check:

```text
/api/v1/observability/overview
Cloudflare Worker queue metrics
Worker logs for raw queue consumer errors
D1 errors around raw_event_dedupe, aggregates, watches, or deliveries
```

Likely causes:

```text
queue binding missing
D1 schema mismatch
validation mismatch between ingest and consumer
Durable Object binding issue
```

## Delivery Retry Buildup

Symptoms:

```text
operator_health.retry_backlog alerts_due or aggregates_due grows
deliveries.retrying grows
deliveries.failed grows
Slack or webhook alerts are delayed
```

Check:

```text
subscriber destination health
response_code and response_body on recent delivery rows
scheduled task status
Cloudflare Cron execution
```

Expected behavior:

```text
2xx => sent
429, 5xx, network error => retrying
400, 401, 403, 404 => failed
```

## Permanent Delivery Failures

If failed delivery count grows:

```text
check whether subscriber URL was removed, revoked, or malformed
confirm Slack webhook still exists
confirm generic webhook endpoint accepts POST application/json
create a new subscriber if the destination is permanently invalid
```

Do not paste full webhook URLs into issues, docs, logs, or commits.

## Email Delivery Checks

If email deliveries fail:

```text
confirm SEND_EMAIL binding exists in wrangler config
confirm sender domain is enabled on Cloudflare Email Routing
check HEADSUPP_EMAIL_FROM and HEADSUPP_EMAIL_REPLY_TO
inspect alert_deliveries.response_body for provider errors
confirm HEADSUPP_PUBLIC_BASE_URL and HEADSUPP_UNSUBSCRIBE_SECRET when unsubscribe links are expected
```

## D1 Migration Or Query Failure

Symptoms:

```text
D1_ERROR in Worker logs
missing table or column errors
operator/admin actions fail after new schema work
```

Apply migration:

```powershell
cd apps/headsupp-api
npx wrangler d1 execute headsup_db --remote --file "migrations/fresh/schema.sql"
```

For legacy databases created before the consolidated schema, run upgrade patches:

```powershell
cd apps/headsupp-api
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0002_correctness_closure.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0003_channel_contracts_and_read_apis.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0004_watch_actions_and_quiet_summaries.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0005_correctness_closure_runtime.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0006_channel_metadata.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0007_email_subscribers.sql"
```

Fresh installs must use `migrations/fresh/schema.sql` and should not run legacy `ALTER TABLE` patches.

## Watch Action Controls

Snooze, mute, resume, and ignore are CFKit admin actions:

```text
admin.snoozeWatch
admin.muteWatch
admin.resumeWatch
admin.ignoreAlert
```

Check `control_plane_audit_logs` for action history. Active snooze/mute rows in `watch_action_controls` suppress watch notifications before cooldown/escalation logic. `admin.ignoreAlert` marks pending or retrying deliveries for that alert as `ignored`.

## Quiet Summaries

Quiet summaries are scheduled proof-of-silence messages. They require subscribers with `mode = quiet_summary` and write to `quiet_summary_deliveries`, not `alerts`.

If summaries are missing:

```text
confirm subscriber mode is quiet_summary
check quiet_summary_deliveries for recent rows
check /api/v1/observability/overview deliveries.quiet_summaries
check scheduled_tasks metadata for quiet_summary counts
```

## Cron Not Running

Symptoms:

```text
operator_health.scheduled_tasks is null
operator_health.scheduled_tasks.status is error
last_success_at is stale
scheduled smoke times out
retry backlog grows because retry processor is cron-driven
```

Check:

```text
wrangler.toml has crons = ["* * * * *"]
Worker was deployed after cron config changes
Cloudflare Cron Trigger logs
D1 operational_status row for scheduled_tasks
```

## Worker Exception Spike

Check:

```text
recent Worker logs
the request path or queue consumer that threw
whether the response used INTERNAL_ERROR
whether the error includes a schema mismatch or missing binding
```

Stable public errors should use safe codes and messages. Stack traces and secret-bearing values should not be returned to API callers.

## Release Checklist

Before declaring a release proven:

```text
1. npm run check passes
2. npm run load:smoke passes
3. remote D1 migration has been applied if schema changed
4. Worker has been deployed
5. smoke:generic-slack passes
6. smoke:alert-decisions passes
7. smoke:scheduled passes
8. smoke:delivery-retry passes
9. smoke:tenant-isolation passes
10. smoke:quiet-summary passes
11. smoke:action-controls passes
12. smoke:channel-contracts passes
13. smoke:aggregate-forward-dimensions passes
14. smoke:advanced-watches passes
15. smoke:operator-observability passes when operator secrets are configured
16. npm run load:high-volume passes
17. npm run soak:release passes
18. /api/v1/observability/overview reports acceptable operator_health
19. secret scan finds no real tokens or webhooks in repo
```
