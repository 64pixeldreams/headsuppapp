import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  latestDelivery,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('event_occurrence');
const signalKey = 'forecast.goal.reached';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;
const health = await checkHealth(runtime.baseUrl);

const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl: 'smoke://status/200',
  subscriberType: 'webhook',
  subscriberMode: 'alert',
  subscriberName: 'Event occurrence smoke receiver',
  signalKey,
  watchName: 'Forecast goal reached occurrence',
  watchType: 'EVENT_OCCURRENCE',
  watchConfig: {
    event_type: 'goal_reached',
    dedupe_key_path: 'fields.goal_id',
    severity: 'success',
    template_id: 'forecast_win_v1',
  },
  cooldownSeconds: 0,
});

async function occurrenceCount(goalId) {
  const row = await client.d1First(
    'SELECT COUNT(*) AS count FROM watch_occurrences WHERE channel_id = ? AND watch_id = ? AND occurrence_key = ?',
    [ids.channel, ids.watch, goalId],
  );
  return Number(row?.count || 0);
}

async function sendGoalReached({ name, idempotencyKey, goalId, headline = '£10,000' }) {
  return sendSignedEvents({
    baseUrl: runtime.baseUrl,
    connectorKey: setup.connectorKey,
    connectorSecret: setup.connectorSecret,
    events: [
      buildMetricEvent({
        runId,
        name,
        signalKey,
        value: 1,
        source: 'event-occurrence-smoke',
        fields: {
          event_type: 'goal_reached',
          tone: 'success',
          icon_variant: 'trophy',
          forecast_id: 'forecast_123',
          goal_id: goalId,
          attention_family: `goal:${goalId}`,
          forecast_name: 'Q2 Revenue',
          resource_name: 'Q2 Revenue',
          notification: {
            title: 'Q2 Revenue',
            summary: `Goal reached: ${headline} hit 6 days early.`,
            detail: `Best value to date is ${headline} against the goal.`,
            headline_value: headline,
            headline_label: 'Goal reached',
          },
          metrics: [
            { label: 'Goal', value: headline },
            { label: 'Observed', value: headline },
            { label: 'Reached on', value: '24 Jun 2026' },
            { label: 'Days early', value: '6' },
          ],
        },
        cta: {
          label: 'View forecast',
          url: 'https://example.com/forecasts/forecast_123',
          variant: 'success',
        },
      }),
    ].map((event) => ({ ...event, idempotency_key: idempotencyKey })),
  });
}

const before = await smokeCounts(client, ids);
const firstAccepted = await sendGoalReached({
  name: 'first',
  idempotencyKey: `${runId}:goal_456:first`,
  goalId: 'goal_456',
});
const first = await pollUntil({
  label: 'first occurrence delivery',
  attempts: 40,
  intervalMs: 3000,
  check: async () => ({
    counts: await smokeCounts(client, ids),
    delivery: await latestDelivery(client, ids),
    occurrence_count: await occurrenceCount('goal_456'),
  }),
  isReady: ({ counts, delivery, occurrence_count }) =>
    counts.alerts === 1 && delivery?.status === 'sent' && occurrence_count === 1,
});

const duplicateAccepted = await sendGoalReached({
  name: 'duplicate-same-goal',
  idempotencyKey: `${runId}:goal_456:duplicate-new-idempotency`,
  goalId: 'goal_456',
});
const duplicate = await pollUntil({
  label: 'duplicate occurrence suppressed',
  attempts: 20,
  intervalMs: 3000,
  check: async () => ({
    counts: await smokeCounts(client, ids),
    occurrence_count: await occurrenceCount('goal_456'),
  }),
  isReady: ({ counts, occurrence_count }) => counts.alerts === 1 && occurrence_count === 1,
});

const secondAccepted = await sendGoalReached({
  name: 'second-new-goal',
  idempotencyKey: `${runId}:goal_789:first`,
  goalId: 'goal_789',
  headline: '£25,000',
});
const second = await pollUntil({
  label: 'second occurrence delivery',
  attempts: 40,
  intervalMs: 3000,
  check: async () => ({
    counts: await smokeCounts(client, ids),
    delivery: await latestDelivery(client, ids),
    first_occurrence_count: await occurrenceCount('goal_456'),
    second_occurrence_count: await occurrenceCount('goal_789'),
  }),
  isReady: ({ counts, delivery, first_occurrence_count, second_occurrence_count }) =>
    counts.alerts === 2
    && counts.sent_deliveries === 2
    && delivery?.status === 'sent'
    && first_occurrence_count === 1
    && second_occurrence_count === 1,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      health: { status: health.status, app: health.app },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        connector_key: setup.connectorKey,
        signal_key: signalKey,
        watch: 'EVENT_OCCURRENCE goal_reached by fields.goal_id',
      },
      ingest: {
        first_events_queued: firstAccepted.queued,
        duplicate_events_queued: duplicateAccepted.queued,
        second_events_queued: secondAccepted.queued,
      },
      assertions: {
        first_alerts: first.counts.alerts,
        duplicate_alerts_still: duplicate.counts.alerts,
        final_alerts: second.counts.alerts,
        final_sent_deliveries: second.counts.sent_deliveries,
        first_occurrence_count: second.first_occurrence_count,
        second_occurrence_count: second.second_occurrence_count,
      },
      counts: {
        before,
        after_first: first.counts,
        after_duplicate: duplicate.counts,
        after_second: second.counts,
      },
    },
    null,
    2,
  ),
);
