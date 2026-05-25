export async function postFunction({ baseUrl, action, payload = {}, apiKey = null, bootstrapToken = null }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (bootstrapToken) headers['X-HeadsUp-Bootstrap-Token'] = bootstrapToken;

  const response = await fetch(`${baseUrl}/api/function`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`Function ${action} failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

export async function getObservabilityOverview({ baseUrl, operatorToken }) {
  const response = await fetch(`${baseUrl}/api/v1/observability/overview`, {
    headers: {
      Authorization: `Bearer ${operatorToken}`,
    },
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`Observability overview failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

export function assertNoSecretLeak(value, labels = ['connector_secret', 'destination_url', 'api_key', 'webhook']) {
  const text = JSON.stringify(value);
  for (const label of labels) {
    if (text.includes(label) && /hu_sec_|hooks\.slack\.com\/services\/[^."]+|api_key"\s*:/.test(text)) {
      throw new Error(`Response appears to leak secret material near ${label}.`);
    }
  }
  return true;
}
