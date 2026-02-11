function createInMemoryStore() {
  const map = new Map();
  const list = [];
  return {
    async listAll() {
      return list.map(id => map.get(id));
    },
    async get(id) {
      return map.get(id) || null;
    },
    async create(payload) {
      const id = payload.recruitId || crypto.randomUUID();
      const now = Date.now();
      const item = {
        ...payload,
        recruitId: id,
        createdAt: now,
        expiresAt: payload.expiresAt || now + 8 * 3600 * 1000
      };
      map.set(id, item);
      if (!list.includes(id)) list.push(id);
      return item;
    },
    async join(id, userId) {
      const r = map.get(id);
      if (!r) return null;
      r.currentMembers = Array.isArray(r.currentMembers) ? r.currentMembers : [];
      if (!r.currentMembers.includes(userId)) {
        if (r.maxMembers && r.currentMembers.length >= r.maxMembers) {
          throw new Error('full');
        }
        r.currentMembers.push(userId);
        map.set(id, r);
      }
      return r;
    },
    async delete(id, requesterId) {
      const r = map.get(id);
      if (!r) return null;
      if (r.ownerId && requesterId && r.ownerId !== requesterId) {
        throw new Error('forbidden');
      }
      map.delete(id);
      const idx = list.indexOf(id);
      if (idx !== -1) list.splice(idx, 1);
      return true;
    }
  };
}

function createStore(env, request) {
  if (env.RECRUITS_DO && typeof env.RECRUITS_DO.get === 'function') {
    const id = env.RECRUITS_DO.idFromName('global');
    const stub = env.RECRUITS_DO.get(id);
    const forwardToDO = async (path, method = 'GET', body = null, headers = {}) => {
      const req = new Request(new URL(path, request.url).toString(), {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined
      });
      return stub.fetch(req);
    };
    return { forwardToDO };
  }

  if (!globalThis.__RECRUIT_STORE) globalThis.__RECRUIT_STORE = createInMemoryStore();
  return globalThis.__RECRUIT_STORE;
}

export { createStore };
