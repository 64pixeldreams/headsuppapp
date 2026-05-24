# Heads Up Product Brief for Cursor

## Product Name

**Heads Up**

## Tagline

**Fewer surprises. Just a heads up.**

---

# What Heads Up Is

Heads Up is an **attention-processing API**.

It is designed to ingest noisy business/system events, aggregate them into meaningful signal streams, evaluate rules against those aggregates, and notify humans or systems only when something actually deserves attention.

It is not a dashboard.  
It is not BI.  
It is not a monitoring screen.  
It is not per-event alerting.

Heads Up exists to solve this problem:

> Modern systems generate too many signals. Operators do not need more dashboards or more alerts. They need to know when something meaningful has changed, gone wrong, stopped happening, recovered, or needs action.

---

# Core Product Concept

Heads Up turns this:

```

```

```
1,000 raw events per minute
```

Into this:

```

```

```
One useful alert, summary, or aggregate output when needed.
```

It does this through:

```

```

```
Connector → Channel → Signal → Aggregate → Watch → Alert / Forward
```

---

# Simple Explanation

A system sends events into Heads Up.

Examples:

```

```

```
payment received
form submitted
machine reading received
forecast pace updated
API call recorded
invoice paid
SEO ranking changed
```

Heads Up does not immediately alert on every event.

Instead, it:

1.   
Accepts the event.  

2.   
Queues it.  

3.   
Aggregates it into time buckets.  

4.   
Evaluates watches against the aggregate.  

5.   
Applies cooldowns/escalation/recovery rules.  

6.   
Sends an alert or aggregate output only when meaningful.  


Most of the time, Heads Up should stay silent.

Silence is a successful outcome.

---

# Primary Use Cases

## 1. Foretic Forecast Notifications

Foretic calculates forecasts, pacing, drift, driver status, and goal progress.

Foretic sends structured state events to Heads Up.

Example:

```

```

```
{
  "signal_key": "forecast.revenue.pace",
  "value": { "num": 64 },
  "fields": {
    "forecast_id": "fc_123",
    "forecast_name": "Repairs By Post May Revenue",
    "pace_percent": 64,
    "status": "critical",
    "actual_to_date": 11200,
    "expected_to_date": 17500,
    "target": 30000
  },
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/fc_123"
  }
}
```

Heads Up decides whether to notify.

Example watch:

```

```

```
Notify if pace drops below 85%.
Escalate if pace drops below 70%.
Do not repeat more than once every 24 hours unless severity worsens.
Notify again when recovered above 95%.
```

Expected behaviour:

```

```

```
90% pace → silent
84% pace → warning alert
82% pace → silent
69% pace → critical escalation
68% pace → silent
96% pace → recovery alert
```

---

## 2. High-Volume Event Aggregation Gateway

A machine, app, or sensor sends many raw readings.

Example:

```

```

```
10, 20, 12, 15, 16, 21, 4
```

Heads Up aggregates them into an hourly bucket:

```

```

```
{
  "signal_key": "oxygen.percent",
  "bucket_type": "hour",
  "values": {
    "sum": 98,
    "count": 7,
    "avg": 14,
    "min": 4,
    "max": 21,
    "last": 4
  }
}
```

Then Heads Up can forward one clean aggregate payload to Foretic or another system.

This prevents Foretic from ingesting millions of raw events directly.

---

## 3. Business Spend / Revenue Watches

A system sends expense or income events.

Examples:

```

```

```
OpenAI spend +$42
Cloudflare spend +$18
Quilt payment received £16,666
Coffee spend +$5.50
```

Heads Up aggregates by day/week/month.

Example watches:

```

```

```
Tell me if OpenAI spend exceeds $500 this week.
Tell me if coffee spend exceeds $300 this month.
Tell me if Quilt payment does not arrive this month.
```

Heads Up alerts only when the aggregate crosses the rule.

---

## 4. Absence Detection

Heads Up must detect not only what happens, but what does not happen.

Examples:

```

```

```
No payment arrived by the expected date.
No lead form submissions received by 10am.
No forecast update received in 24 hours.
No machine reading received in 5 minutes.
No supplier update received in 48 hours.
```

This must be handled by scheduled evaluation, not by ingest.

---

## 5. Aggregate Forwarding

Heads Up is also an event reducer.

It can accept raw high-volume input and emit clean downstream aggregate events.

Example:

```

```

```
Input:
thousands of sensor readings per minute

Output:
one hourly aggregate event to Foretic
```

This is a core use case, not an afterthought.

Heads Up should support subscribers in two modes:

```

```

```
alert
aggregate_forward
```

---

# What Heads Up Is Not

Do not build:

```

```

```
dashboard
charts
BI views
Slack OAuth
email connector
billing
complex ML
anomaly detection
workflow builder
per-event alerting
long-term raw event storage
```

The MVP is API-only.

---

# Core Objects

## Workspace

A tenant.

Example:

```

```

```
Inc64
Repairs By Post
Foretic Demo
```

## Channel

A business or operational context.

Examples:

```

```

```
Repairs By Post Revenue
Foretic Forecast Events
Machine Oxygen Readings
Finance
SEO
Ops
```

Channels isolate:

```

```

```
connectors
signals
watches
subscribers
alerts
aggregates
```

## Connector

An inbound source.

MVP connector:

```

```

```
webhook
```

Future connectors:

```

```

```
email
Stripe
bank email
Cloudflare
Foretic native
```

## Signal

A stream of related numeric/state events.

Examples:

```

```

```
forecast.revenue.pace
oxygen.percent
payment.amount
form.submit.count
api.error.count
seo.rank.delta
```

## Aggregate

A time-bucketed rollup of signal events.

Examples:

```

```

```
minute average
hourly sum
daily count
monthly last value
```

## Watch

A rule that evaluates aggregate state.

Examples:

```

```

```
last value below 85
hourly average below 15
weekly sum above 300
daily count equals zero
expected event missing
hourly aggregate closed
```

## Alert

A persisted notification-worthy event.

## Subscriber

An outbound destination.

MVP subscriber:

```

```

```
webhook
```

Future:

```

```

```
Slack
email
SMS
agent API
```

---

# Required Behaviour

## Ingest Behaviour

When an event hits:

```

```

```
POST /v1/events/{connector_key}
```

The API must:

```

```

```
authenticate
validate basic schema
enqueue event
return 202 immediately
```

It must not:

```

```

```
write aggregates inline
evaluate watches inline
send alerts inline
call Slack/webhooks inline
```

---

# Rule Behaviour

Rules must evaluate aggregates, never raw events.

Correct:

```

```

```
Evaluate weekly coffee spend aggregate > $300
```

Wrong:

```

```

```
Alert on every coffee transaction
```

Correct:

```

```

```
Evaluate hourly oxygen average < 15
```

Wrong:

```

```

```
Alert on every low oxygen reading
```

Correct:

```

```

```
Evaluate latest Foretic pace value < 85
```

Wrong:

```

```

```
Send notification every time Foretic emits a state update
```

---

# Silence Behaviour

The system must deliberately suppress noise.

If a watch triggers once, repeat alerts should not fire until:

```

```

```
cooldown expires
severity increases
recovery happens
digest is due
a new window triggers and the watch allows it
```

---

# CTA Behaviour

Events may include a CTA.

Example:

```

```

```
{
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/fc_123",
    "kind": "review"
  }
}
```

Alerts should preserve CTA data.

This allows downstream notifications to include:

```

```

```
View forecast
Fix issue
Review payment
Open channel
```

---

# User Stories for Stress Testing

## Story 1: Foretic Forecast Goes Behind Pace

As a Foretic user, I want to watch a forecast so that I am notified only when the forecast becomes meaningfully behind pace.

Acceptance:

```

```

```
Given forecast pace updates arrive every minute
When pace falls from 90 to 84
Then Heads Up sends one warning alert

When pace continues at 83, 82, 81
Then Heads Up stays silent

When pace falls to 69
Then Heads Up sends one critical escalation

When pace remains below 70
Then Heads Up stays silent until cooldown/digest/escalation rule allows another notification
```

---

## Story 2: Forecast Recovers

As a Foretic user, I want to know when a critical forecast recovers.

Acceptance:

```

```

```
Given a critical alert previously fired at 69%
When pace rises to 96%
Then Heads Up sends one recovery alert

When pace remains at 97%
Then Heads Up stays silent
```

---

## Story 3: Board Subscribed to Annual Revenue Forecast

As a CEO, I want board members subscribed to a revenue forecast so they receive meaningful updates without noise.

Acceptance:

```

```

```
Given a yearly revenue forecast is updated daily
When the forecast remains on track
Then no alert is sent

When the forecast becomes warning-level behind
Then a warning alert is sent

When the forecast becomes critical
Then a critical alert is sent

When no material change occurs
Then no repeated daily spam is sent

Optional:
A weekly digest can be sent if configured
```

---

## Story 4: High-Volume Machine Readings

As a system integrator, I want to send thousands of machine readings to Heads Up and have it forward one hourly aggregate to Foretic.

Acceptance:

```

```

```
Given 10,000 oxygen.percent events arrive in an hour
When the hour closes
Then Heads Up sends one aggregate payload to Foretic

The payload includes:
sum
count
avg
min
max
last

No raw events are forwarded to Foretic
No alert spam occurs
Aggregates are correct
Duplicate input events do not double count
```

---

## Story 5: Spend Threshold

As a founder, I want to know when a spending category exceeds a weekly threshold.

Acceptance:

```

```

```
Given multiple expense events arrive during the week
When weekly coffee spend reaches $300
Then Heads Up sends one alert

When additional coffee expenses arrive
Then Heads Up does not keep alerting repeatedly during cooldown
```

---

## Story 6: Missing Expected Payment

As a founder, I want to know if an expected monthly payment does not arrive.

Acceptance:

```

```

```
Given a watch expects at least one Quilt payment each month
When the expected window plus grace period passes
And no matching income signal has arrived
Then Heads Up sends one missing expected alert

The alert does not repeat constantly
```

---

## Story 7: Missing Forecast Updates

As a Foretic operator, I want to know if a forecast stops sending updates.

Acceptance:

```

```

```
Given a forecast normally emits state every hour
When no forecast_state event arrives for 3 hours
Then Heads Up sends one missing update alert
```

---

## Story 8: Webhook Subscriber

As a developer, I want to attach a webhook subscriber so another system can receive alerts.

Acceptance:

```

```

```
Given a webhook subscriber exists
When an alert is created
Then Heads Up creates an AlertDelivery
And dispatches the alert payload by webhook
And retries failed deliveries with backoff
```

---

## Story 9: Aggregate Subscriber

As a developer, I want to attach a webhook subscriber that receives aggregates, not alerts.

Acceptance:

```

```

```
Given an AGGREGATE_FORWARD watch exists
When an hourly bucket closes
Then Heads Up sends one aggregate payload to the subscriber

If retry happens
Then the same aggregate is not duplicated permanently

If the subscriber receives the same payload twice due to retry
Then the payload includes stable ids so the receiver can dedupe
```

---

## Story 10: Idempotency

As an API user, I want to retry event delivery safely.

Acceptance:

```

```

```
Given the same idempotency_key is sent twice
When Heads Up processes the events
Then aggregates are updated only once
```

---

# Stress Test Requirements

Cursor should design and test against these loads:

## Load Test 1

```

```

```
10,000 events sent to one connector in batches
```

Expected:

```

```

```
202 response from ingest
queue accepts events
aggregates correct
no duplicate alerts
```

## Load Test 2

```

```

```
1,000 events per minute for one signal
```

Expected:

```

```

```
minute/hour aggregates remain correct
watch evaluation does not spam
system does not evaluate every raw event as an alert
```

## Load Test 3

```

```

```
same event retried 10 times
```

Expected:

```

```

```
only one aggregate update
```

## Load Test 4

```

```

```
multiple workers process events for same signal/bucket
```

Expected:

```

```

```
aggregate rows remain correct because SQL upsert is atomic
```

## Load Test 5

```

```

```
forecast pace updates every minute for 24 hours
```

Expected:

```

```

```
only meaningful alert transitions:
warning
critical
recovery
digest if configured
```

---

# MVP Success Criteria

The MVP is successful if it can prove:

```

```

```
1. It can ingest high-volume events.
2. It can aggregate events safely.
3. It can evaluate watches against aggregates.
4. It can suppress alert spam.
5. It can detect missing expected events.
6. It can forward aggregate summaries to Foretic.
7. It can dispatch alert webhooks reliably.
8. It can preserve CTA links back to the source system.
```

---

# Product Positioning for Cursor

Build this as a reusable API product.

Foretic is the first client, but Heads Up must not depend on Foretic.

Heads Up should know nothing about Bayesian forecasting, cones, datasets, or forecast models.

Foretic sends structured state.

Heads Up watches, aggregates, suppresses noise, and notifies.

Clean separation:

```

```

```
Foretic = outcome intelligence
Heads Up = attention runtime
```

The MVP should make this possible:

```

```

```
A Foretic user watches a forecast.
Foretic emits state updates.
Heads Up alerts only when meaningful.
Heads Up can also forward clean aggregate data back into Foretic.
```

---

# Final Instruction to Cursor

Build the smallest Cloudflare-native API that proves the following loop:

```

```

```
Receive event
→ queue event
→ aggregate event
→ evaluate watch
→ suppress noise
→ create alert or aggregate output
→ deliver by webhook
```

Do not build UI.

Do not build dashboards.

Do not build email yet.

Do not build AI yet.

Make the core engine correct, scalable, quiet, and reusable.