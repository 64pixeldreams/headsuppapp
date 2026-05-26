# Public Docs Site And Sync Pipeline

## User Story

As a developer evaluating Heads Up, I want public documentation at a stable URL with accurate SDK install and API examples, so I can onboard without access to private repositories.

## Product Fit

**Developer experience** for the same API product. Publishing curated docs is not a dashboard or BI feature.

## Scope

- Deploy a **curated** docs site to `docs.headsupp.io` containing only customer-safe content.
- Source of truth flow:
  - Canonical SDK docs: `headsuppclientsdk/docs/` (or `packages/headsupp-client` mirror in app repo)
  - App mirror: `docs/public-sdk/` via `scripts/sync-public-sdk-docs.mjs`
  - Publish subset: quickstart, getting-started, client reference, watch types, subscribers, aggregate forwarding, cookbook index
- **Exclude** from public publish:
  - `stories/`, internal runbooks with secrets, smoke harness details, bootstrap token instructions, operator-only observability guides
- Automate publish in CI (GitHub Actions) on merge to `main` for docs source repos, or document a manual deploy command if CI is deferred.
- Fix broken relative links in published docs (no references to files that exist only in the private app repo without mirroring).
- Add `docs.headsupp.io` link to SDK README and `docs/public-sdk/README.md`.

## Out Of Scope

- Auto-publishing the entire private `docs/api/` tree.
- In-app documentation search or versioned doc sets beyond `main`.
- Dashboard or account UI inside the docs site (link out to `app.headsupp.io` only).

## Acceptance Criteria

- `docs.headsupp.io` loads and navigates without 404s for the published set.
- Quickstart shows correct install (`@64pixeldreams/headsupp-client` or documented Git fallback) and `https://api.headsupp.io` base URL.
- SDK README links resolve on the public site (no broken `quickstart.md in main repo` wording).
- Sync script is documented in `scripts/sync-public-sdk-docs.mjs` header and in operations runbook.
- No internal secrets, bootstrap tokens, or operator tokens appear in published HTML.

## Test Plan

- Run `node scripts/sync-public-sdk-docs.mjs` locally and verify diff is intentional.
- Add `scripts/verify-public-docs-links.mjs` (or extend SDK `verify-docs.mjs`) to fail CI on broken internal links in `docs/public-sdk/`.
- Run `npm run check`.
- Manual check: open `docs.headsupp.io` quickstart and confirm install + first event example.

## API Documentation

- Update `docs/public-sdk/README.md` with public docs URL.
- Update `docs/api/node-cloudflare-client.md` published-docs pointer.
- Add `docs/commercialization/public-docs-publishing.md` (operator runbook for publish flow).

## Implementation Notes

- Prefer Cloudflare Pages or a minimal static site generator; keep build simple.
- `headsuppclientsdk` repo can host the deployable site root; app repo sync keeps copies aligned.
- Use the same doc structure already added: `getting-started.md`, `concepts/`, `cookbook/`, `appendix/` (customer-safe appendix only).

## Done Definition

- Public docs site live at `docs.headsupp.io`.
- Link checker passes on published corpus.
- Runbook documents sync + deploy.
- `npm run check` passes.

## Status

Pending.

## Depends On

01 (canonical hostnames).

## Blocks

06 (customer onboarding docs link to public site).
