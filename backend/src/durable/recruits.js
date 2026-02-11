import { jsonResponse, notFoundResponse, safeReadJson } from "../utils/http.js";

const DEFAULT_STATE = () => ({ items: {}, list: [], history: {} });
const HISTORY_LIMIT = 200;

export class RecruitsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async loadStore() {
    const stored = await this.state.storage.get("recruits");
    return stored || DEFAULT_STATE();
  }

  async saveStore(store) {
    await this.state.storage.put("recruits", store);
  }

  cleanup(store) {
    const now = Date.now();
    const ttlHours = Number(this.env.RECRUITS_TTL_HOURS || 8);
    const closedRetentionHours = Number(this.env.RECRUITS_CLOSED_RETENTION_HOURS || 5);

    removeExpiredRecruits(store, now);
    pruneHistory(store, now, ttlHours * 3600 * 1000, closedRetentionHours * 3600 * 1000);
  }

  addHistory(store, id, type, snapshot) {
    store.history = store.history || {};
    const events = store.history[id] || [];
    events.push({ ts: Date.now(), type, snapshot });
    if (events.length > HISTORY_LIMIT) {
      events.splice(0, events.length - HISTORY_LIMIT);
    }
    store.history[id] = events;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const store = await this.loadStore();
    this.cleanup(store);

    if (method === "GET" && url.pathname === "/api/recruits") {
      return listRecruits(store);
    }

    const recruitMatch = matchRecruitPath(url.pathname);
    if (recruitMatch) {
      return await this.handleRecruitRoute({ request, method, store, match: recruitMatch });
    }

    if (method === "POST" && url.pathname === "/api/recruits") {
      return await this.handleCreateRecruit(request, store);
    }

    if (method === "GET" && url.pathname === "/api/recruits-history") {
      return handleGlobalHistory(url, store);
    }

    if (method === "GET" && url.pathname === "/api/recruits-at") {
      return handleSnapshotAt(url, store);
    }

    return notFoundResponse();
  }

  async handleRecruitRoute(context) {
    const { method, match, request, store } = context;
    const { id, action } = match;

    if (method === "GET" && action === "base") {
      return getRecruit(store, id);
    }

    if (method === "GET" && action === "history") {
      return historyForRecruit(new URL(request.url), store, id);
    }

    if (method === "PATCH" && action === "base") {
      return await this.handleUpdateRecruit(request, store, id);
    }

    if (method === "DELETE" && action === "base") {
      return await this.handleDeleteRecruit(request, store, id);
    }

    if (method === "POST" && action === "join") {
      return await this.handleJoinRecruit(request, store, id);
    }

    return notFoundResponse();
  }

  async handleCreateRecruit(request, store) {
    const data = await safeReadJson(request);
    const recruitId = (data?.recruitId || data?.id || "").toString();
    const ownerId = (data?.ownerId || data?.owner_id || "").toString();

    if (!recruitId || !ownerId) {
      return jsonResponse({ error: "recruitId_and_ownerId_required" }, 400);
    }

    const record = buildRecruitRecord(data, this.env);
    store.items[recruitId] = record;
    if (!store.list.includes(recruitId)) {
      store.list.unshift(recruitId);
    }
    this.addHistory(store, recruitId, "create", { ...record });
    await this.saveStore(store);

    return jsonResponse({ ok: true, recruitId }, 201);
  }

  async handleUpdateRecruit(request, store, id) {
    const update = await safeReadJson(request);
    const existing = store.items[id];
    if (!existing) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const updated = applyRecruitUpdate(existing, update, this.env);
    store.items[id] = updated;
    this.addHistory(store, id, "update", { ...updated });
    await this.saveStore(store);

    return jsonResponse({ ok: true, recruit: updated });
  }

  async handleDeleteRecruit(request, store, id) {
    const payload = await safeReadJson(request);
    const requester = payload?.userId || payload?.ownerId;
    const existing = store.items[id];

    if (!existing) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const isOwner = requester && String(requester) === String(existing.ownerId);
    if (!isOwner) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    delete store.items[id];
    const idx = store.list.indexOf(id);
    if (idx >= 0) {
      store.list.splice(idx, 1);
    }
    this.addHistory(store, id, "delete", { id, deletedAt: new Date().toISOString() });
    await this.saveStore(store);

    return jsonResponse({ ok: true, deleted: id });
  }

  async handleJoinRecruit(request, store, id) {
    const body = await safeReadJson(request);
    const userId = body?.userId || body?.user_id;
    if (!userId) {
      return jsonResponse({ error: "user_id_required" }, 400);
    }

    const existing = store.items[id];
    if (!existing) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    existing.participants = Array.isArray(existing.participants) ? existing.participants : [];
    if (!existing.participants.includes(userId)) {
      if (existing.maxMembers && existing.participants.length >= Number(existing.maxMembers)) {
        return jsonResponse({ error: "full" }, 409);
      }
      existing.participants.push(userId);
    }

    store.items[id] = existing;
    await this.saveStore(store);

    return jsonResponse({ ok: true, recruit: existing });
  }
}

function listRecruits(store) {
  const items = (store.list || []).map((id) => store.items[id]).filter(Boolean);
  return jsonResponse({ items });
}

function getRecruit(store, id) {
  const record = store.items[id];
  if (!record) {
    return jsonResponse({ error: "not_found" }, 404);
  }
  return jsonResponse(record);
}

function historyForRecruit(url, store, id) {
  const params = url.searchParams;
  const fromMs = params.get("from") ? Date.parse(params.get("from")) : 0;
  const toMs = params.get("to") ? Date.parse(params.get("to")) : Date.now();
  const events = (store.history?.[id] || []).filter((ev) => ev.ts >= fromMs && ev.ts <= toMs);
  return jsonResponse({ id, events });
}

function handleGlobalHistory(url, store) {
  const params = url.searchParams;
  const fromMs = params.get("from") ? Date.parse(params.get("from")) : 0;
  const toMs = params.get("to") ? Date.parse(params.get("to")) : Date.now();
  const idFilter = params.get("id");

  const events = [];
  const ids = idFilter ? [idFilter] : Object.keys(store.history || {});
  for (const id of ids) {
    const arr = (store.history?.[id] || []).filter((ev) => ev.ts >= fromMs && ev.ts <= toMs);
    for (const ev of arr) {
      events.push({ id, ...ev });
    }
  }
  events.sort((a, b) => a.ts - b.ts);
  return jsonResponse({ events });
}

function handleSnapshotAt(url, store) {
  const ts = url.searchParams.get("ts") ? Date.parse(url.searchParams.get("ts")) : Date.now();
  const ids = Array.from(new Set([...(store.list || []), ...Object.keys(store.history || {})]));
  const items = [];

  for (const id of ids) {
    const arr = (store.history?.[id] || []).filter((ev) => ev.ts <= ts);
    if (!arr.length) continue;
    const last = arr[arr.length - 1];
    if (last?.snapshot) {
      items.push(last.snapshot);
    }
  }

  return jsonResponse({ items });
}

function buildRecruitRecord(data, env) {
  const now = new Date();
  const ttlHours = Number(env.RECRUITS_TTL_HOURS || 8);
  const expiresAt = data?.expiresAt || new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();

  return {
    id: data?.recruitId || data?.id,
    recruitId: data?.recruitId || data?.id,
    ownerId: data?.ownerId || data?.owner_id,
    title: (data?.title || "").toString(),
    description: (data?.description || data?.content || "").toString(),
    game: (data?.game || "").toString(),
    platform: (data?.platform || "").toString(),
    startTime: data?.startTime || now.toISOString(),
    maxMembers: Number(data?.maxMembers || 0) || undefined,
    voice: Boolean(data?.voice),
    participants: Array.isArray(data?.participants) ? data.participants.slice(0, 100) : [],
    createdAt: data?.createdAt || now.toISOString(),
    expiresAt,
    status: (data?.status || "recruiting").toString(),
    metadata: data?.metadata || {}
  };
}

function applyRecruitUpdate(original, update, env) {
  const next = { ...original };
  const allowedFields = [
    "title",
    "description",
    "game",
    "platform",
    "status",
    "maxMembers",
    "voice",
    "metadata",
    "expiresAt",
    "closedAt"
  ];

  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(update, key)) {
      if (key === "maxMembers") {
        next[key] = Number(update[key]);
      } else if (key === "metadata") {
        // Merge metadata instead of replacing
        next[key] = { ...(original?.metadata || {}), ...update[key] };
      } else {
        next[key] = update[key];
      }
    }
  }

  if (shouldMarkAsClosed(original, next, update)) {
    markRecruitClosed(next, env);
  }

  return next;
}

function shouldMarkAsClosed(existing, next, update) {
  const wasRecruiting = String(existing.status || "recruiting") === "recruiting";
  const willRecruiting = String(update.status ?? next.status ?? "recruiting") === "recruiting";
  return wasRecruiting && !willRecruiting;
}

function markRecruitClosed(record, env) {
  const closedRetentionHours = Number(env.RECRUITS_CLOSED_RETENTION_HOURS || 5);
  const now = new Date();
  if (!record.closedAt) {
    record.closedAt = now.toISOString();
  }
  const exp = new Date(now.getTime() + closedRetentionHours * 3600 * 1000);
  record.expiresAt = exp.toISOString();
}

function removeExpiredRecruits(store, now) {
  const toDelete = [];
  for (const id of Object.keys(store.items || {})) {
    const record = store.items[id];
    const exp = record?.expiresAt ? Date.parse(record.expiresAt) : 0;
    if (exp && exp <= now) {
      toDelete.push(id);
    }
  }

  for (const id of toDelete) {
    delete store.items[id];
    const idx = (store.list || []).indexOf(id);
    if (idx >= 0) {
      store.list.splice(idx, 1);
    }
  }
}

function pruneHistory(store, now, recruitingWindowMs, closedWindowMs) {
  store.history = store.history || {};
  const entries = Object.entries(store.history);

  for (const [id, events] of entries) {
    const list = Array.isArray(events) ? events : [];
    const pruned = list.filter((event) => {
      const snapshot = event?.snapshot || null;
      const status = String(snapshot?.status || "recruiting");
      const keepWindow = status === "recruiting" ? recruitingWindowMs : closedWindowMs;
      return event.ts && now - event.ts <= keepWindow;
    });

    if (pruned.length) {
      store.history[id] = pruned;
    } else {
      delete store.history[id];
    }
  }
}

function matchRecruitPath(pathname) {
  const historyMatch = pathname.match(/^\/api\/recruits\/(.+?)\/history$/);
  if (historyMatch) {
    return { id: decodeURIComponent(historyMatch[1]), action: "history" };
  }

  const joinMatch = pathname.match(/^\/api\/recruits\/(.+?)\/join$/);
  if (joinMatch) {
    return { id: decodeURIComponent(joinMatch[1]), action: "join" };
  }

  const baseMatch = pathname.match(/^\/api\/recruits\/(.+?)$/);
  if (baseMatch) {
    return { id: decodeURIComponent(baseMatch[1]), action: "base" };
  }

  return null;
}
