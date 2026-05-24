export function createCloudflareClient({ accountId, apiToken, databaseId, kvNamespaceId }) {
  async function request(path, init = {}) {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok || body.success === false) {
      throw new Error(`Cloudflare API failed ${response.status}: ${text}`);
    }
    return body.result;
  }

  async function d1Query(sql, params = []) {
    const result = await request(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({ sql, params }),
    });
    return Array.isArray(result) ? result[0] : result;
  }

  async function d1First(sql, params = []) {
    const result = await d1Query(sql, params);
    return result?.results?.[0] || null;
  }

  async function putKvJson(key, value) {
    await request(`/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  }

  return {
    request,
    d1Query,
    d1First,
    putKvJson,
  };
}
