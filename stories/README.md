# Heads Up Stories

This folder contains the build queue for Heads Up.

Each numbered Markdown file is one story stub. Expand one story at a time using:

- `docs/story-execution.md`
- `docs/cursor-build-loop.md`
- `docs/testing-harness.md`
- `docs/api/README.md`

## Build Rule

Cursor should build one story at a time and run:

```bash
npm test
```

If tests fail, Cursor should fix the issue and rerun tests until green before moving on.

If a story creates or changes an endpoint, auth rule, event payload, delivery payload, or integration behavior, Cursor must update `docs/api/` in the same story.

## Current Story Count

There are 76 story files.

Stories marked `_done` are complete. Pending stories should be built one at a time or in an agreed batch, with tests and docs updated before marking `_done`.

## Hardening Batch

```text
50 Operator bootstrap and generic provisioning_done
51 Deployed smoke harness foundation_done
52 Deployed cooldown/recovery/escalation smoke_done
53 Deployed scheduled watches smoke_done
54 Deployed delivery retry smoke_done
55 Deployed tenant isolation smoke_done
56 OpenAPI reference and engineer docs_done
57 Smoke test suite index_done
```

## Urgent Productization Batch 1

Bootstrap and production auth hardening:

```text
58 Operator service API key bootstrap_done
59 Admin API resource provisioning flow_done
60 API key lifecycle and rotation_done
61 Admin tenant permission hardening_done
62 Control plane audit logging_done
```

## Urgent Productization Batch 2

Release automation and operations:

```text
63 CI release automation_done
64 Operational health and alerting_done
65 Production error handling and runbooks_done
```

## Correctness Closure Batch

```text
66 Foretic D1 canonical provisioning
67 Contract path extraction
68 Dimensioned aggregates
69 Late event last value correctness
70 Idempotency processed state
71 CTA and data preservation
72 Foretic recovery semantics
73 Outbound webhook signing
74 Protected observability
75 Delta watch types
76 Release soak test
```
