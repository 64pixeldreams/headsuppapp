# Observability API

Heads Up exposes read-only operational endpoints for debugging and build verification. These are not dashboard APIs and do not return webhook URLs, secrets, connector secrets, raw event bodies, or delivery payload bodies.

## Overview

`GET /api/v1/observability/overview`

Returns counts for active watches, aggregate rows, delivery states, retry backlog, stale pending deliveries, and scheduled task health.

Authentication is required. Provide either:

```text
Authorization: Bearer <HEADSUPP_OPERATOR_TOKEN>
X-HeadsUp-Operator-Token: <HEADSUPP_OPERATOR_TOKEN>
X-HeadsUp-Bootstrap-Token: <HEADSUPP_BOOTSTRAP_TOKEN>
```

Example response:

```json
{
  "success": true,
  "data": {
    "status": "degraded",
    "active_watches": 2,
    "aggregate_rows": 99,
    "deliveries": {
      "alerts": {
        "pending": 1,
        "retrying": 3,
        "failed": 0
      },
      "aggregates": {
        "pending": 4,
        "retrying": 1,
        "failed": 2
      },
      "quiet_summaries": {
        "pending": 0,
        "retrying": 0,
        "failed": 0
      }
    },
    "operator_health": {
      "retry_backlog": {
        "alerts_due": 1,
        "aggregates_due": 0
      },
      "old_pending": {
        "alerts": 0,
        "aggregates": 0
      },
      "scheduled_tasks": {
        "status": "ok",
        "last_success_at": "2026-05-24T18:00:00.000Z",
        "last_failure_at": null,
        "last_error_code": null,
        "last_error_message": null,
        "updated_at": "2026-05-24T18:00:00.000Z"
      }
    }
  }
}
```

Status meanings:

```text
ok: no failed or retrying deliveries and cron is healthy
watch: retry backlog exists but no failures are recorded
degraded: failed deliveries exist
error: scheduled task status reports error
```

Operational fields are safe for operators. They do not include raw payloads, API keys, connector secrets, or full webhook destinations.

Quiet-summary counts are delivery-state counts for scheduled proof-of-silence messages. The endpoint still does not return quiet-summary payload bodies or destination URLs.
