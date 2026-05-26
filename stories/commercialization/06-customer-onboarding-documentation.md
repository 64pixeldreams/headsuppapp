# Customer Onboarding Documentation

## User Story

As a new customer, I want clear documentation for creating an account, creating an API key, and running the SDK quickstart, so I can go from zero to a working integration without operator help.

## Product Fit

Documentation for **access and onboarding**, not new API behavior. Complements stories 01–05.

## Scope

- Add end-to-end customer path doc (app repo + public SDK mirror):
  - Create account at `https://app.headsupp.io`
  - Create service API key in portal
  - Set `HEADSUPP_BASE_URL` and `HEADSUPP_API_KEY`
  - Run SDK quickstart: workspace → channel → connector → subscriber → watch → send event
- Update `docs/public-sdk/getting-started.md` and `headsuppclientsdk/docs/getting-started.md` to:
  - Lead with customer self-serve path
  - Keep operator bootstrap path in a clearly labeled **Internal / operator** section
- Update `docs/api/getting-started-api-keys.md` with the same split.
- Add troubleshooting section:
  - `PERMISSION_DENIED`
  - unverified email
  - revoked key
  - wrong base URL (dev vs production)
- Ensure all doc links point to `docs.headsupp.io` paths that exist after story 02.
- Run `scripts/sync-public-sdk-docs.mjs` and verify SDK `npm run verify:docs` passes.

## Out Of Scope

- Video tutorials or marketing copy on `www.headsupp.io`.
- Documenting future billing meters or plan limits.
- Full OpenAPI publish (existing openapi.yaml policy unchanged).

## Acceptance Criteria

- A reader with no repo access can follow public docs from account creation to first signed event.
- No doc tells customers to use `HEADSUPP_BOOTSTRAP_TOKEN` for normal onboarding.
- SDK README "start here" links work on `docs.headsupp.io`.
- Operator bootstrap remains documented for Inc64 operators only.
- `node scripts/verify-docs.mjs` (SDK) and app link check pass.

## Test Plan

- Run SDK `npm run verify:docs` in `headsuppclientsdk`.
- Run app `node scripts/sync-public-sdk-docs.mjs` then link verify if present.
- Peer review: follow docs as a new user checklist.
- Run `npm run check`.

## API Documentation

- New: `docs/api/customer-onboarding.md` (canonical in app repo).
- Mirrored into `docs/public-sdk/customer-onboarding.md` or merged into `getting-started.md` (avoid duplicate maintenance — pick one canonical file and link).

## Implementation Notes

- Keep examples generic (`demo.metric`, coffee spend) — no real secrets.
- Reference `@64pixeldreams/headsupp-client` version pinned in docs (bump with story 105 process).

## Done Definition

- Customer onboarding path documented in app + SDK + public site.
- Bootstrap path labeled internal-only.
- Link verification green.
- `npm run check` passes.

## Status

Pending.

## Depends On

02 (public docs site), 04 (self-serve keys), 05 (portal URLs).

## Blocks

None.
