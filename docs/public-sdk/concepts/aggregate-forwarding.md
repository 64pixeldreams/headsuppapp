# Aggregate Forwarding (Concept)

`AGGREGATE_FORWARD` sends **closed** time buckets to a subscriber with `mode: aggregate_forward`.

Supported bucket types: `minute`, `hour`, `day`, `week`, `month` (UTC boundaries).

Aggregate fields: `sum`, `count`, `avg`, `min`, `max`, `last`.

**Implementation guide (SDK):** [cookbook/aggregate-forwarding.md](../cookbook/aggregate-forwarding.md)

**Inbound verification:** [webhook-receivers.md](../webhook-receivers.md)

**Canonical HTTP reference (optional):** [appendix/canonical-api-docs.md](../appendix/canonical-api-docs.md)
