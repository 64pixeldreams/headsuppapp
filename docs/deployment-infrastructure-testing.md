# Deployment Infrastructure Testing

This checklist proves the deployed Heads Up infrastructure is wired correctly after changes to Workers, D1, Queues, Email Routing, secrets, or smoke-test infrastructure.

## Infrastructure Pieces

```text
main API worker: headsupp_app
inbound email worker: headsup_email_worker
D1 database: headsup_db
inbound test address: tester@aibox.headsupp.io
inbound route: tester@aibox.headsupp.io -> headsup_email_worker
shared secret on both workers: HEADSUPP_EMAIL_WORKER_WEBHOOK_SECRET
```

Do not commit secret values. Set runtime secrets with Wrangler.

## Deploy Order

```powershell
cd apps/headsupp-api
npx wrangler d1 execute headsup_db --remote --file "migrations/0009_email_test_messages.sql"
npx wrangler secret put HEADSUPP_EMAIL_WORKER_WEBHOOK_SECRET
npx wrangler deploy

cd ../headsupp-email-worker
npx wrangler secret put HEADSUPP_EMAIL_WORKER_WEBHOOK_SECRET
npx wrangler deploy
```

The same generated secret value must be used for both workers. The Email Worker signs receipts and `headsupp_app` verifies them before writing `email_test_messages`.

## Required Proofs

Run local tests first:

```powershell
cd apps/headsupp-api
npm test
```

Then run the deployed inbox loop:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:email-inbox-loop
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

Expected result:

```text
"ok": true
"tested": 13
```

The deployed proof must include:

```text
LAST_VALUE_GT
LAST_VALUE_LT
WINDOW_SUM_GT
WINDOW_COUNT_GT
DELTA_GT
DELTA_LT
PERCENT_CHANGE_GT
PERCENT_CHANGE_LT
TREND_UP_GT
TREND_DOWN_GT
MISSING_EXPECTED
REMINDER_DUE
DIGEST
```

Each case must create an outbound email, route through Cloudflare Email Routing, reach `headsup_email_worker`, post a signed receipt to `headsupp_app`, and update `email_test_messages.status` to `tested`.

## Manual Visual Email Proof

Keep the broad regression suite on `tester@aibox.headsupp.io`. Use the human inbox only for deliberate visual layout checks:

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_EMAIL_DESTINATION='martin@inc64.com'
npm run smoke:email-real
Remove-Item Env:HEADSUPP_SMOKE_EMAIL_DESTINATION
```

Do not run human-recipient matrix smokes on every deploy.
