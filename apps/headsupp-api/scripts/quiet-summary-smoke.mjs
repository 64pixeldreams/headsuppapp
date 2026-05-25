import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { checkHealth } from './smoke/events.mjs';
import {
  genericSmokeIds,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { redactUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds('quiet_summary');
const startedAt = new Date().toISOString();
const subscriberUrl = process.env.HEADSUPP_SMOKE_WEBHOOK_URL || 'https://httpbin.org/status/200';
const now = new Date().toISOString();

async function quietSummaryCounts() {
  const [quiet, sentQuiet, failedQuiet, payload] = await Promise.all([
    client.d1First('SELECT COUNT(*) AS count FROM quiet_summary_deliveries WHERE channel_id = ?', [ids.channel]),
    client.d1First("SELECT COUNT(*) AS count FROM quiet_summary_deliveries WHERE channel_id = ? AND status = 'sent'", [
      ids.channel,
    ]),
    client.d1First("SELECT COUNT(*) AS count FROM quiet_summary_deliveries WHERE channel_id = ? AND status = 'failed'", [
      ids.channel,
    ]),
    client.d1First(
      'SELECT payload_json, status FROM quiet_summary_deliveries WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1',
      [ids.channel],
    ),
  ]);
  return {
    quiet_summary_deliveries: Number(quiet?.count || 0),
    sent_quiet_summaries: Number(sentQuiet?.count || 0),
    failed_quiet_summaries: Number(failedQuiet?.count || 0),
    latest_status: payload?.status || null,
    payload: payload?.payload_json ? JSON.parse(payload.payload_json) : null,
    alerts: (await smokeCounts(client, ids)).alerts,
  };
}

const health = await checkHealth(runtime.baseUrl);
await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: null,
  subscriberUrl,
  subscriberType: 'webhook',
  subscriberMode: 'quiet_summary',
  subscriberName: 'Quiet summary smoke receiver',
  signalKey: 'demo.quiet_summary',
  watchName: 'Quiet summary smoke watch',
  watchConfig: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
});

await client.d1Query(
  `INSERT INTO watch_states (watch_id, last_status, last_evaluated_at, state_json, updated_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(watch_id)
   DO UPDATE SET last_status = excluded.last_status,
     last_evaluated_at = excluded.last_evaluated_at,
     state_json = excluded.state_json,
     updated_at = excluded.updated_at`,
  [ids.watch, 'quiet', now, JSON.stringify({ smoke: 'quiet_summary' }), now],
);

const before = await quietSummaryCounts();
const proof = await pollUntil({
  label: 'quiet summary delivery',
  attempts: 40,
  intervalMs: 3000,
  check: quietSummaryCounts,
  isReady: (counts) =>
    counts.quiet_summary_deliveries > before.quiet_summary_deliveries &&
    (counts.sent_quiet_summaries > 0 || counts.failed_quiet_summaries > 0) &&
    counts.alerts === 0,
});

if (proof.alerts !== 0) {
  throw new Error(`Quiet summary created normal alerts: ${JSON.stringify(proof)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      receiver: redactUrl(subscriberUrl),
      health: { status: health.status, app: health.app },
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        watch_id: ids.watch,
        subscriber_id: ids.subscriber,
      },
      counts: { before, after: proof },
      payload: {
        type: proof.payload?.type,
        status: proof.payload?.status,
        watches: proof.payload?.watches?.length || 0,
      },
    },
    null,
    2,
  ),
);
