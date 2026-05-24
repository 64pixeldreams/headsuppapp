# Cloudflare Bindings And Config_done

## Spec Check

The spec requires D1, KV, Queues, Durable Objects, and Cron. Resources must be scoped to the new Heads Up app and must not touch Foretic or other applications.

## Scope

- Configure `headsup_`/`headsup-` Cloudflare resources in `wrangler.toml`.
- Bind `DB`, Heads Up KV namespaces, raw event queue, alert delivery queue, aggregate delivery queue, `WatchEvaluatorDO`, and cron trigger.

## Acceptance Criteria

- Worker name is `headsupp_app`.
- Account id and bindings are defined.
- Queue names use Cloudflare-compatible hyphen names.
- Cron trigger is configured for scheduled work.

## Test Plan

- Configuration is read during local Worker tests.
- Queue/scheduled behavior is unit tested in service modules.

## Status

Done.
