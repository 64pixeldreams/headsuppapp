# Public SDK Docs Export

This folder is the curated public documentation surface for SDK consumers.

Source of truth remains:
- `docs/api/` for API docs
- `packages/headsupp-client/README.md` for SDK usage

Only the files in this folder are eligible for public SDK sync automation.

## Included Files

- `quickstart.md`
- `reference.md`
- `watch-types.md`
- `use-cases.md`
- `webhook-receivers.md`
- `aggregate-forwarding.md`
- `openapi.yaml`
- `sdk-readme.md`

## Maintainer Notes

- Do not add internal runbooks, archive docs, or operational incident docs here.
- Keep secrets/internal URLs out of this folder.
- Sync automation validates this folder before opening a PR in the SDK repo.
