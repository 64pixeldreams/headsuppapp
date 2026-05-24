# Observability API

Heads Up exposes read-only operational endpoints for debugging and build verification. These are not dashboard APIs and do not return webhook URLs, secrets, connector secrets, raw event bodies, or delivery payload bodies.

## Overview

`GET /api/v1/observability/overview`

Returns counts for active watches, aggregate rows, and delivery states.

Example response:

```json
{
  "success": true,
  "data": {
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
      }
    }
  }
}
```
