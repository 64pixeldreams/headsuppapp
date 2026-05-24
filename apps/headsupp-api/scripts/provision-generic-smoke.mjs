import { createCloudflareClient } from './smoke/cloudflare-client.mjs';
import { genericSmokeIds, provisionGenericScenario } from './smoke/generic-provisioning.mjs';
import { redactSlackUrl, requireEnv, smokeRuntime } from './smoke/runtime.mjs';

const runtime = smokeRuntime();
requireEnv('CLOUDFLARE_API_TOKEN', runtime.apiToken);
requireEnv('HEADSUPP_SMOKE_SLACK_WEBHOOK_URL', runtime.slackWebhookUrl);

const scenarioId = process.env.HEADSUPP_SMOKE_SCENARIO_ID || 'operator_generic';
const signalKey = process.env.HEADSUPP_SMOKE_SIGNAL_KEY || 'demo.metric';
const ids = genericSmokeIds(scenarioId);
const client = createCloudflareClient(runtime);
const setup = await provisionGenericScenario({
  client,
  ids,
  slackWebhookUrl: runtime.slackWebhookUrl,
  signalKey,
  watchName: 'Operator generic metric high',
  watchConfig: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      scenario_id: ids.scenarioId,
      base_url: runtime.baseUrl,
      workspace_id: ids.workspace,
      channel_id: ids.channel,
      connector_key: setup.connectorKey,
      signal_key: signalKey,
      slack_destination: redactSlackUrl(runtime.slackWebhookUrl),
      event_url: `${runtime.baseUrl}/v1/events/${setup.connectorKey}`,
      connector_secret_note: 'Connector secret is held in runtime smoke state only; do not commit real secrets.',
    },
    null,
    2,
  ),
);
