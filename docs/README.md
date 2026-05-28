# Heads Up Documentation

This folder contains the documentation for the operational Heads Up API.

## Source Of Truth

Use these documents for current API behavior:

```text
README.md
docs/api/README.md
docs/api/quickstart.md
docs/api/reference.md
docs/api/node-cloudflare-client.md
docs/api/openapi.yaml
docs/api/spec-alignment-audit.md
docs/api/smoke-test-suite.md
docs/deployment-infrastructure-testing.md
docs/final-smoke-runbook.md
docs/operations-runbook.md
```

Primary onboarding path is now:

- [docs/api/quickstart.md](api/quickstart.md)
- [docs/api/reference.md](api/reference.md)
- [docs/api/use-cases.md](api/use-cases.md)

Other API docs should stay trimmed and link back to those two files.

Use [SPEC_BREIF.md](../SPEC_BREIF.md) and [Curosr_headsupp_product_brief.md](../Curosr_headsupp_product_brief.md) as product/spec sources. Those files preserve original product language and may include historical milestone terminology.

## Current API Docs

`docs/api/` contains current API documentation. Behavior-changing stories must update [docs/api/](api/README.md) in the same change when they affect:

```text
public endpoints
CloudFunction actions
auth or permissions
event payloads
delivery payloads
subscriber behavior
operator runbooks
smoke proof commands
deployment infrastructure testing
```

## Historical Archive

[`docs/archive/`](archive/README.md) contains historical plans and audits. Archived docs are preserved for context and are not implementation truth unless explicitly revalidated.

Do not use archived docs to decide current runtime behavior. Start from [docs/api/README.md](api/README.md) and [docs/api/spec-alignment-audit.md](api/spec-alignment-audit.md) instead.

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
