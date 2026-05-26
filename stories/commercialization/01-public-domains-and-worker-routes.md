# Public Domains And Worker Routes

## User Story

As a Heads Up customer, I want stable public URLs for the API, account portal, and documentation, so integrations and SDK examples do not depend on a personal Cloudflare Workers dev hostname.

## Product Fit

Commercial **distribution** only. The runtime remains the same Heads Up Core API on Cloudflare Workers. This story does not add dashboard features, billing, or new alert behavior.

## Scope

- Document and configure production hostnames:
  - `api.headsupp.io` → Heads Up API Worker (`headsupp_app` or production worker name)
  - `app.headsupp.io` → minimal account portal (story 05)
  - `docs.headsupp.io` → public docs site (story 02)
- Add Cloudflare DNS records and custom domain bindings for each surface.
- Set production `HEADSUPP_BASE_URL` (and related env vars) to `https://api.headsupp.io`.
- Ensure health checks respond on the custom domain:
  - `GET /health`
  - `GET /api/v1/health`
- Update SDK examples, `docs/public-sdk/`, and `packages/headsupp-client/README.md` to use `https://api.headsupp.io` as the canonical base URL (keep dev Worker URL documented as optional).
- Add a short runbook section for domain cutover and rollback.

## Out Of Scope

- Marketing site redesign on `www.headsupp.io`.
- Multi-region or multi-worker sharding.
- WAF/rate-limit productization beyond what exists today.
- Billing or usage metering.

## Acceptance Criteria

- `api.headsupp.io` serves the same API as the production Worker (ingest + `/api/function` + observability paths already deployed).
- TLS terminates correctly on all three hostnames.
- Public docs and portal base URLs are documented and do not reference the dev Worker hostname as primary.
- No secrets are committed in wrangler config or docs.

## Test Plan

- Manual or scripted smoke against `https://api.headsupp.io/health` returning success.
- Deployed smoke that uses `HEADSUPP_BASE_URL=https://api.headsupp.io` for at least one existing smoke script (for example generic Slack or admin provisioning) when production secrets are available.
- Run `npm run check` (no regressions from env/doc changes in repo).

## API Documentation

- Update `docs/api/quickstart.md` base URL section.
- Update `docs/api/getting-started-api-keys.md` with production base URL.
- Add `docs/operations-runbook.md` section: **Public domains**.

## Implementation Notes

- Use Cloudflare dashboard or `wrangler` custom domain configuration per Worker/Pages project.
- Keep `app.headsupp.io` and `docs.headsupp.io` separable from the API Worker so the API stays stateless and small.
- Preserve existing dev Worker URL for internal/staging use; label it clearly in docs.

## Done Definition

- All three hostnames route to the intended surfaces.
- Canonical base URL in customer docs is `https://api.headsupp.io`.
- Runbook documents DNS, bindings, and rollback.
- `npm run check` passes.

## Status

Pending.

## Depends On

None (start here).

## Blocks

02, 03, 04, 05, 06 (docs and examples should use final hostnames).
