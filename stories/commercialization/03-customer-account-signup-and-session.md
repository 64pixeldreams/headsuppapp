# Customer Account Signup And Session

## User Story

As a new Heads Up customer, I want to create an account and sign in securely, so I can obtain API credentials without asking an operator for a bootstrap token.

## Product Fit

**Commercial onboarding** for the existing API. Does not change ingest, aggregation, or watch evaluation. After signup, customers still use admin APIs and the SDK for channels, watches, and subscribers.

## Scope

- Add customer auth using vendored **CFKit auth** patterns (signup, login, logout, session validation).
- Require verified email before full API-key creation (or document explicit MVP exception with rate limits).
- On first successful signup, create:
  - a default **workspace** for the account;
  - optional default **channel** (named e.g. `Default`) scoped with `source_app`, `external_tenant_id`, `external_user_id` tied to the user/account id.
- Map authenticated user id to control-plane ownership fields used by existing tenant guards.
- Expose session-authenticated CloudFunctions or routes for:
  - `account.signup`
  - `account.login`
  - `account.logout`
  - `account.me` (safe profile + workspace ids, no secrets)
- Keep **operator bootstrap** (`operator.bootstrapServiceApiKey` + `HEADSUPP_BOOTSTRAP_TOKEN`) unchanged for internal ops.
- Audit log signup and login events (reuse control-plane audit patterns where practical).

## Out Of Scope

- OAuth social login (Google/GitHub) unless trivial via existing CFKit support.
- Organization/team invites and role matrix.
- Billing accounts and Stripe.
- Passwordless-only auth without a documented fallback.
- Dashboard pages beyond what story 05 covers.

## Acceptance Criteria

- A new user can sign up and receive a session token (cookie or bearer, document one canonical approach).
- Session cannot call admin actions until a service API key is created (story 04) unless explicitly designed otherwise.
- Default workspace is created once per account; duplicate signup does not create duplicate default workspaces.
- `account.me` returns workspace id(s) needed for SDK quickstart continuation.
- Bootstrap token path still works for operators; customer signup does not weaken bootstrap authorization.
- No passwords or session tokens in logs, tests, or committed fixtures.

## Test Plan

- Unit tests for signup validation, duplicate email rejection, and workspace bootstrap idempotency.
- Integration tests for login → `account.me` → logout.
- Negative tests: invalid credentials, unverified email if verification is enabled.
- Run `npm run check`.
- Secret scan.

## API Documentation

- Add `docs/api/customer-accounts.md` (signup, login, session headers, `account.me` shapes).
- Update `docs/api/authentication.md` with customer vs operator vs service API key diagram.
- Update `docs/api/reference.md` with new actions.

## Implementation Notes

- Reuse `cfkit/src/modules/auth/` patterns; do not fork a second auth system.
- Store users in D1 or CFKit-backed storage consistent with existing metadata patterns.
- Default workspace naming and `source_app` value must be stable for future billing metering (e.g. `headsupp-customer`).

## Done Definition

- Signup/login/session flows implemented and tested.
- Default workspace provisioning works.
- Customer account docs published (app repo + sync to public SDK docs where appropriate).
- `npm run check` passes.

## Status

Pending.

## Depends On

01 (production base URL for session cookie domain if cookie-based).

## Blocks

04, 05, 06.
