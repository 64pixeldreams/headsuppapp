export function createKVControlPlaneStore(kv, { prefix = 'control' } = {}) {
  if (!kv) {
    throw new Error('HEADSUPP_CACHE KV binding is required for control-plane storage.');
  }

  return {
    async get(type, key) {
      return kv.get(`${prefix}:${type}:${key}`, 'json');
    },

    async put(type, key, value) {
      await kv.put(`${prefix}:${type}:${key}`, JSON.stringify(value));
      return value;
    },
  };
}

export function createMemoryControlPlaneStore(seed = {}) {
  const data = new Map(Object.entries(seed));

  return {
    async get(type, key) {
      return data.get(`${type}:${key}`) || null;
    },

    async put(type, key, value) {
      data.set(`${type}:${key}`, value);
      return value;
    },

    snapshot() {
      return Object.fromEntries(data.entries());
    },
  };
}
