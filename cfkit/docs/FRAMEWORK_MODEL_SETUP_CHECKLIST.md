# Framework Model Setup Checklist (Repo-wide CFKit)

This checklist is for the shared CFKit framework in this repo.  
It is not a Foretic product story doc.

Use this when adding or updating any DataModel-backed feature.

## Required setup steps

1. Define model with:
   - primary key (`primary: true`, `auto: true`, `prefix`)
   - `d1.table` and `d1.syncFields`
   - `options` (`timestamps`, `softDelete`, auth behavior)
2. Register model via `EnhancedDataModel.registerModel(...)`.
3. Ensure model file is imported in app model bootstrap (`src/models/register-all.js`).
4. Ensure KV class mapping exists in `src/modules/datastore/adapters/kv.js`.
5. Ensure `wrangler.toml` has required bindings:
   - `DB` D1 database
   - required KV namespaces (`USERS`, `SESSIONS`, `CACHE`, etc.)
6. Ensure schema initialization path is active:
   - app startup calls `initializeDatabase(modelRegistry, datastore, logger)`
   - optionally run `system.initialize` in environments that require manual init
7. Deploy and smoke test model-backed CloudFunctions.

## Dashboard models status (current repo)

This repo now satisfies the checklist for dashboard models:

- `ORACLE_DASHBOARD` model exists:
  - `foretic-saas/cf/apps/oracle-api/src/models/oracle-dashboard.js`
- `ORACLE_DASHBOARD_WIDGET` model exists:
  - `foretic-saas/cf/apps/oracle-api/src/models/oracle-dashboard-widget.js`
- both are imported in:
  - `foretic-saas/cf/apps/oracle-api/src/models/register-all.js`
- both are mapped in KV adapter:
  - `foretic-saas/cf/src/modules/datastore/adapters/kv.js`
- dashboard CloudFunctions use `DataModel`/`Datastore` patterns:
  - `foretic-saas/cf/apps/oracle-api/src/functions/register-oracle-api.js`
- D1 schema init is wired on worker startup:
  - `foretic-saas/cf/apps/oracle-api/src/index.js`

## Canonical docs

- `foretic-saas/cf/docs/DATAMODEL_SETUP_GUIDE.md`
- `foretic-saas/cf/CFKIT_CURSOR_DEVELOPER_GUIDE.md`
- `foretic-saas/cf/docs/SETUP_COMPLETE_GUIDE.md` (reference example)
