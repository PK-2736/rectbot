import { jsonResponse } from "../utils/http.js";

const DEFAULT_STORE = () => ({ items: {} });

export class InviteTokensDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async loadStore() {
    const store = await this.state.storage.get("tokens");
    return store || DEFAULT_STORE();
  }

  async saveStore(store) {
    await this.state.storage.put("tokens", store);
  }

  cleanup(store) {
    const now = Date.now();
    const ttlSec = Number(this.env.ONE_TIME_INVITE_TTL_SEC || 600);
    const expMs = ttlSec * 1000;
    const items = store.items || {};

    for (const [token, meta] of Object.entries(items)) {
      const createdAt = new Date(meta.createdAt || 0).getTime();
      if (!createdAt || now - createdAt > expMs) {
        delete items[token];
      }
    }

    store.items = items;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    const store = await this.loadStore();
    this.cleanup(store);

    if (method === "POST" && url.pathname === "/do/invite-token") {
      const token = generateInviteToken();
      store.items[token] = { used: false, createdAt: new Date().toISOString() };
      await this.saveStore(store);
      return jsonResponse({ ok: true, token }, 201);
    }

    const consumeMatch = url.pathname.match(/^\/do\/invite-token\/([A-Za-z0-9_\-]+)\/consume$/);
    if (method === "POST" && consumeMatch) {
      const token = consumeMatch[1];
      const meta = store.items[token];
      if (!meta) {
        return jsonResponse({ ok: false, error: "not_found" }, 404);
      }
      if (meta.used) {
        return jsonResponse({ ok: false, error: "used" }, 410);
      }
      meta.used = true;
      store.items[token] = meta;
      await this.saveStore(store);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "not_found" }, 404);
  }
}

function generateInviteToken() {
  return `${crypto.randomUUID().replace(/-/g, "")}${Math.random().toString(36).slice(2, 10)}`;
}
