# Minimal Account Portal

## User Story

As a Heads Up customer, I want a small web UI to sign up, sign in, and manage my API keys, so I do not need curl-only onboarding for account and credential setup.

## Product Fit

This is a **credential portal**, not a Heads Up dashboard. Only three functional areas are allowed. All product configuration (watches, subscribers, connectors beyond defaults) remains in the API, SDK, and docs.

## Scope

- Deploy a minimal app at `app.headsupp.io` (Cloudflare Pages or lightweight Worker + static assets).
- Pages (only):
  1. **Sign up** / **Log in** / **Log out**
  2. **API keys** — create, list (redacted), revoke, rotate; show one-time secret modal on create/rotate
  3. **Get started** — copy blocks only:
     - `HEADSUPP_BASE_URL=https://api.headsupp.io`
     - SDK install command
     - link to `https://docs.headsupp.io` quickstart
     - optional: workspace id from `account.me`
- Call story 03/04 backend actions; no direct D1 access from the browser.
- Use HTTPS-only; secure session cookie settings if cookie-based auth.
- Basic styling is fine; no charts, tables of alerts, or watch editors.

## Out Of Scope

- Watch builder, subscriber editor, connector manager UI, alert inbox.
- Usage graphs and billing checkout.
- Raw event viewer or aggregate explorer.
- Slack OAuth or email template editor.
- Mobile apps.

## Acceptance Criteria

- New user can complete: sign up → create API key → copy base URL and install command → open docs quickstart.
- API key secret is shown once and not stored in localStorage.
- Logged-out users cannot access the keys page.
- Portal contains no references to bootstrap token for customers.
- Lighthouse/security basics: no API keys in page source except one-time display.

## Test Plan

- E2E test (Playwright or documented manual checklist) for signup → key create → logout → login.
- Contract tests for portal API client against account actions.
- Run `npm run check` for any shared packages touched.
- Optional: deploy preview URL smoke before `app.headsupp.io` cutover.

## API Documentation

- Add `docs/commercialization/account-portal.md` (pages, env vars, deploy).
- Link from `docs/public-sdk/getting-started.md`: "Create account" → `https://app.headsupp.io`.

## Implementation Notes

- Prefer a tiny stack (plain HTML + fetch, or minimal framework) in `apps/headsupp-portal/` or `apps/headsupp-account/`.
- Share no code with Foretic or other apps.
- Environment: `VITE_HEADSUPP_API_URL` or equivalent pointing at `api.headsupp.io`.

## Done Definition

- Portal live at `app.headsupp.io` with three areas only.
- E2E or signed manual test checklist attached in story PR.
- Docs updated.
- `npm run check` passes for monorepo packages touched.

## Status

Pending.

## Depends On

01 (app hostname), 03, 04 (backend).

## Blocks

None (last implementation story in MVP chain).
