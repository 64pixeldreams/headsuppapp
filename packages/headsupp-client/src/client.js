import { assertAccepted, assertSuccess, HeadsUpApiError } from './errors.js';
import { signedEventHeaders, signEventPayload } from './hmac.js';

function trimBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function requireOption(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HeadsUpApiError('Heads Up API returned invalid JSON.', {
      code: 'INVALID_JSON_RESPONSE',
      status: response.status,
      response: text,
    });
  }
}

function resource(data, key) {
  return data?.[key] || data;
}

export function createHeadsUpClient({ baseUrl, apiKey, bootstrapToken, fetch: fetchFn = globalThis.fetch } = {}) {
  const root = trimBaseUrl(requireOption(baseUrl, 'baseUrl'));
  if (typeof fetchFn !== 'function') throw new Error('fetch is required.');

  async function postJson(path, body, headers = {}) {
    const response = await fetchFn(`${root}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const json = await readJson(response);
    if (!response.ok && !json?.success && !json?.accepted) {
      throw new HeadsUpApiError(response.statusText || 'Heads Up API request failed.', {
        code: 'HTTP_ERROR',
        status: response.status,
        response: json,
      });
    }
    return json;
  }

  async function requestFunction(action, payload = {}, options = {}) {
    const bearer = options.apiKey || apiKey;
    const headers = { ...(options.headers || {}) };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (options.bootstrapToken || (!bearer && bootstrapToken)) {
      headers['X-HeadsUp-Bootstrap-Token'] = options.bootstrapToken || bootstrapToken;
    }
    return assertSuccess(await postJson('/api/function', { action, payload }, headers));
  }

  async function sendRawPayload({ connectorKey, connectorSecret, payload, timestamp = new Date().toISOString() }) {
    requireOption(connectorKey, 'connectorKey');
    requireOption(connectorSecret, 'connectorSecret');
    const rawBody = JSON.stringify(payload);
    const headers = await signedEventHeaders({ connectorSecret, timestamp, rawBody });
    const response = await fetchFn(`${root}/v1/events/${encodeURIComponent(connectorKey)}`, {
      method: 'POST',
      headers,
      body: rawBody,
    });
    const json = await readJson(response);
    return assertAccepted(json);
  }

  return {
    requestFunction,
    bootstrapServiceApiKey: (payload) =>
      requestFunction('operator.bootstrapServiceApiKey', payload, { bootstrapToken }).then((data) => data),
    createWorkspace: (payload) => requestFunction('admin.createWorkspace', payload).then((data) => resource(data, 'workspace')),
    createChannel: (payload) => requestFunction('admin.createChannel', payload).then((data) => resource(data, 'channel')),
    getChannel: (payload) => requestFunction('admin.getChannel', payload).then((data) => resource(data, 'channel')),
    updateChannel: (payload) => requestFunction('admin.updateChannel', payload).then((data) => resource(data, 'channel')),
    createChannelContract: (payload) =>
      requestFunction('admin.createChannelContract', payload).then((data) => resource(data, 'channel_contract')),
    updateChannelContract: (payload) =>
      requestFunction('admin.updateChannelContract', payload).then((data) => resource(data, 'channel_contract')),
    createConnector: (payload) => requestFunction('admin.createConnector', payload).then((data) => resource(data, 'connector')),
    createSignal: (payload) => requestFunction('admin.createSignal', payload).then((data) => data),
    createWatch: (payload) => requestFunction('admin.createWatch', payload).then((data) => resource(data, 'watch')),
    createSubscriber: (payload) => requestFunction('admin.createSubscriber', payload).then((data) => resource(data, 'subscriber')),
    listChannelAlerts: (payload) => requestFunction('admin.listChannelAlerts', payload),
    getWatchState: (payload) => requestFunction('admin.getWatchState', payload).then((data) => resource(data, 'watch_state')),
    snoozeWatch: (payload) => requestFunction('admin.snoozeWatch', payload).then((data) => resource(data, 'action_control')),
    muteWatch: (payload) => requestFunction('admin.muteWatch', payload).then((data) => resource(data, 'action_control')),
    resumeWatch: (payload) => requestFunction('admin.resumeWatch', payload).then((data) => resource(data, 'action_control')),
    ignoreAlert: (payload) => requestFunction('admin.ignoreAlert', payload).then((data) => resource(data, 'action_control')),
    sendEvent: ({ connectorKey, connectorSecret, event, timestamp }) =>
      sendRawPayload({ connectorKey, connectorSecret, payload: event, timestamp }),
    sendEvents: ({ connectorKey, connectorSecret, events, timestamp }) =>
      sendRawPayload({ connectorKey, connectorSecret, payload: { events }, timestamp }),
    signEventPayload,
  };
}
