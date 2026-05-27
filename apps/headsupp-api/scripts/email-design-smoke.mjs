import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { buildMetricEvent, checkHealth, sendSignedEvents } from './smoke/events.mjs';
import {
  genericSmokeIds,
  latestAlert,
  latestDelivery,
  provisionGenericScenario,
  smokeCounts,
} from './smoke/generic-provisioning.mjs';
import { pollUntil } from './smoke/polling.mjs';
import { requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
const emailDestination = process.env.HEADSUPP_SMOKE_EMAIL_DESTINATION;
const templateId = process.env.HEADSUPP_SMOKE_EMAIL_TEMPLATE || 'metric_alert_v1';
const defaultIconByTemplate = {
  spend_alert_v1: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/3e0d7a3c-74f7-4092-c84b-fcb59cb03e00/public',
  forecast_alert_v1: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/129ca8d6-1dcd-4148-aac2-5e2a698fd200/public',
  metric_alert_v1: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/7c0fd57e-0771-4b56-19bd-0df9263c1300/public',
  brand_alert_v1: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/7c0fd57e-0771-4b56-19bd-0df9263c1300/public',
};
const designIconUrl = process.env.HEADSUPP_SMOKE_EMAIL_ICON_URL || defaultIconByTemplate[templateId] || defaultIconByTemplate.metric_alert_v1;

requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_EMAIL_DESTINATION', emailDestination);

const client = createCloudflareClient(runtime);
const ids = genericSmokeIds(`email_design_${templateId}`);
const signalKey = 'business.metric.health';
const startedAt = new Date().toISOString();
const runId = `${ids.scenarioId}:${Date.now()}`;
const health = await checkHealth(runtime.baseUrl);

const setup = await provisionGenericScenario({
  client,
  ids,
  subscriberUrl: emailDestination,
  subscriberType: 'email',
  subscriberMode: 'alert',
  subscriberName: 'Design Review Email Alerts',
  signalKey,
  watchName: 'Business metric health',
  watchType: 'LAST_VALUE_GT',
  watchConfig: {
    threshold: 50,
    severity: 'warning',
    bucket_type: 'minute',
  },
  cooldownSeconds: 1,
});

await client.d1Query('UPDATE subscribers SET config_json = ?, destination_url_redacted = ?, updated_at = ? WHERE id = ?', [
  JSON.stringify({
    template_id: templateId,
    actions: ['snooze_1h', 'snooze_1d', 'stop_watching'],
    locale: 'en-US',
    timezone: 'UTC',
    branding: {
      brand_name: process.env.HEADSUPP_SMOKE_EMAIL_BRAND || 'Heads Up Demo',
      title: process.env.HEADSUPP_SMOKE_EMAIL_TITLE || process.env.HEADSUPP_SMOKE_EMAIL_BRAND || 'Heads Up Demo',
      subtitle: process.env.HEADSUPP_SMOKE_EMAIL_SUBTITLE || null,
      logo_url: process.env.HEADSUPP_SMOKE_EMAIL_LOGO_URL || null,
      accent_color: process.env.HEADSUPP_SMOKE_EMAIL_ACCENT || '#1f883d',
      footer_text: 'Fewer surprises. Just a heads up.',
    },
    labels: {
      current_label: 'Current score',
      threshold_label: 'Alert threshold',
    },
  }),
  `${String(emailDestination).slice(0, 2)}***`,
  new Date().toISOString(),
  ids.subscriber,
]);

const before = await smokeCounts(client, ids);
const triggerAccepted = await sendSignedEvents({
  baseUrl: runtime.baseUrl,
  connectorKey: setup.connectorKey,
  connectorSecret: setup.connectorSecret,
  events: [
    buildMetricEvent({
      runId,
      name: 'trigger-design-email',
      signalKey,
      value: 64,
      source: 'email-design-smoke',
      fields: {
        resource_name: 'Generic integration design check',
        notification: {
          title: 'Generic alert template design check',
          summary: 'This is a rich generic alert, shaped only by event metadata and subscriber branding.',
          detail: 'Use this smoke to review spacing, typography, CTA treatment, metric rows, and alert controls.',
          icon_url: designIconUrl,
        },
        metrics: [
          { label: 'Current value', value: '64' },
          { label: 'Target', value: '50' },
          { label: 'Business impact', value: '$7,500 at risk' },
          { label: 'Time left', value: '3 days' },
        ],
      },
      cta: {
        label: 'View details',
        url: 'https://app.foretic.io/app/job?job_id=oracle_job%3Amn9dh3gk76zusj',
      },
    }),
  ],
});

const delivered = await pollUntil({
  label: 'email design delivery',
  check: async () => ({
    counts: await smokeCounts(client, ids),
    delivery: await latestDelivery(client, ids),
    alert: await latestAlert(client, ids),
  }),
  isReady: ({ delivery }) => Boolean(delivery && ['sent', 'failed'].includes(delivery.status)),
});

if (delivered.delivery?.status !== 'sent') {
  throw new Error(`Design email delivery did not reach sent status: ${JSON.stringify(delivered.delivery)}`);
}

const responseBody = JSON.parse(delivered.delivery.response_body || '{}');
if (responseBody.template_id !== templateId) {
  throw new Error(`Expected template ${templateId}; got ${responseBody.template_id}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      started_at: startedAt,
      base_url: runtime.baseUrl,
      template_id: templateId,
      recipient_hint: `${String(emailDestination).slice(0, 2)}***`,
      setup: {
        workspace_id: ids.workspace,
        channel_id: ids.channel,
        connector_key: setup.connectorKey,
        signal_key: signalKey,
        watch: 'LAST_VALUE_GT threshold 50',
        subscriber_type: 'email',
      },
      ingest: {
        trigger_events_sent: 1,
        trigger_events_queued: triggerAccepted.queued,
      },
      counts: {
        before,
        after_trigger: delivered.counts,
      },
      latest_alert: delivered.alert,
      latest_delivery: delivered.delivery,
      expected_email_behavior: `One immediate warning email using ${templateId} with four metric rows, CTA, unsubscribe, and alert controls.`,
      health: {
        status: health.status,
        app: health.app,
      },
    },
    null,
    2,
  ),
);
