# Heads Up Documentation

This folder contains the documentation for the operational Heads Up API.

## Source Of Truth

Use these documents for current API behavior:

```text
README.md
docs/api/README.md
docs/api/cursor-api-instructions.md
docs/api/quickstart.md
docs/api/reference.md
docs/api/spec-alignment-audit.md
docs/api/smoke-test-suite.md
docs/final-smoke-runbook.md
docs/operations-runbook.md
```

Use `SPEC_BREIF.md` and `Curosr_headsupp_product_brief.md` as product/spec sources. Those files preserve original product language and may include historical milestone terminology.

## Current API Docs

`docs/api/` contains current API documentation. Behavior-changing stories must update `docs/api/` in the same change when they affect:

```text
public endpoints
CloudFunction actions
auth or permissions
event payloads
delivery payloads
subscriber behavior
operator runbooks
smoke proof commands
```

## Historical Archive

`docs/archive/` contains historical plans and audits. Archived docs are preserved for context and are not implementation truth unless explicitly revalidated.

Do not use archived docs to decide current runtime behavior. Start from `docs/api/README.md` and `docs/api/spec-alignment-audit.md` instead.

## Ownership

Heads Up documentation is proprietary intellectual property owned by 64 Pixel Holdings LLC and operated by Inc64 LLC. See `../LICENSE`.

## Secret Policy

Never commit:

```text
Cloudflare API tokens
Slack webhook URLs
Heads Up API keys
connector secrets
operator/bootstrap tokens
customer payloads
```
