// Recruitment, DO proxy, and Grafana-related routes
// Returns a Response if this router handled the request; otherwise returns null

export async function routeRecruitment(request, env, ctx, url, corsHeaders, sendToSentry) {
  // Helper: allow restricting DO reads to Grafana-only
  const READ_DO_ONLY_FOR_GRAFANA = String(env.RECRUITS_READ_DO_ONLY_FOR_GRAFANA || 'false').toLowerCase() === 'true';
  const isGrafanaPath = (p) => (
    p === '/metrics' ||
    p === '/api/grafana/recruits' ||
    p === '/api/grafana/recruits/history' ||
    p === '/api/grafana/recruits/at'
  );

  // Prometheus metrics endpoint for Grafana
  if (url.pathname === '/metrics' && request.method === 'GET') {
    try {
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const listReq = new Request(new URL('/api/recruits', request.url).toString(), {
        method: 'GET',
        headers: { 'content-type': 'application/json' }
      });
      const resp = await stub.fetch(listReq);
      const data = await resp.json();
      const items = data.items || [];

      const now = Date.now();
      const activeRecruits = items.filter(r => {
        const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
        return exp > now && r.status === 'recruiting';
      });

      const metrics = [
        `# HELP recruits_total Total number of recruitment posts`,
        `# TYPE recruits_total gauge`,
        `recruits_total ${items.length}`,
        `# HELP recruits_active Active recruitment posts`,
        `# TYPE recruits_active gauge`,
        `recruits_active ${activeRecruits.length}`,
        `# HELP recruits_participants_total Total participants across all recruits`,
        `# TYPE recruits_participants_total gauge`,
        `recruits_participants_total ${items.reduce((sum, r) => sum + (r.participants?.length || 0), 0)}`
      ].join('\n');

      return new Response(metrics, {
        status: 200,
        headers: { 'content-type': 'text/plain; version=0.0.4', ...corsHeaders }
      });
    } catch (e) {
      console.error('[Metrics] Error:', e);
      return new Response('# Error generating metrics\n', {
        status: 500,
        headers: { 'content-type': 'text/plain; version=0.0.4', ...corsHeaders }
      });
    }
  }

  // Grafana JSON datasource endpoints
  // Grafana JSON datasource endpoints
  if ((url.pathname === '/api/grafana/recruits' || url.pathname === '/api/grafana/recruits/search') && (request.method === 'POST' || request.method === 'GET')) {
    try {
      // Check Grafana access token for security
      const grafanaToken = env.GRAFANA_TOKEN;
      if (grafanaToken) {
        const providedToken = request.headers.get('x-grafana-token') || request.headers.get('authorization')?.replace('Bearer ', '');
        if (!providedToken || providedToken !== grafanaToken) {
          console.warn('[Grafana API] Unauthorized access attempt', { grafanaToken: !!grafanaToken, providedToken: !!providedToken });
          return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // Debug incoming headers and request
      try {
        const hdrs = {};
        for (const [k, v] of request.headers.entries()) hdrs[k] = v;
        console.log('[Grafana API] Request:', { method: request.method, path: url.pathname, hasToken: !!grafanaToken });
      } catch (_) {}

      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const listReq = new Request(new URL('/api/recruits', request.url).toString(), {
        method: 'GET',
        headers: { 'content-type': 'application/json' }
      });
      const resp = await stub.fetch(listReq);
      const data = await resp.json();
      const items = data.items || [];

      console.log(`[Grafana API] Got ${items.length} items from DO`);

      let body = {};
      try { body = await request.json(); } catch {}
      const range = body?.range || {};
      const toMs = range?.to ? Date.parse(range.to) : Date.now();
      const fromMs = range?.from ? Date.parse(range.from) : (toMs - 5*3600*1000);

      const withinRange = (ts) => {
        const t = ts ? Date.parse(ts) : NaN;
        return !Number.isNaN(t) && t >= fromMs && t <= toMs;
      };

      const filtered = items.filter(r => {
        const now = Date.now();
        const status = String(r.status || 'recruiting');
        const expMs = r.expiresAt ? Date.parse(r.expiresAt) : Infinity;
        const isActive = status === 'recruiting' && expMs > now;
        const isRecentlyClosed = status !== 'recruiting' && (r.closedAt ? withinRange(r.closedAt) : (expMs >= (toMs - 5*3600*1000)));
        return isActive || isRecentlyClosed || withinRange(r.createdAt);
      });

      console.log(`[Grafana API] Filtered to ${filtered.length} items`);

      const formatted = filtered.map(r => ({
        id: r.recruitId || r.id,
        message_id: r.message_id || r.messageId || null,
        title: r.title,
        content: r.description || r.content || r.title || null,
        note: r.note || (r.metadata && r.metadata.note) || null,
        guild_id: r.guildId || r.guild_id || null,
        guild_name: r.guildName || r.guild_name || null,
        channel_id: r.channelId || r.channel_id || null,
        channel_name: r.channelName || r.channel_name || null,
        game: r.game,
        platform: r.platform,
        ownerId: r.ownerId,
        participants_count: r.participants?.length || r.currentParticipants || r.participants_count || 0,
        currentMembers: r.participants?.length || r.currentMembers || 0,
        maxMembers: r.maxMembers || 0,
        voice: r.voice,
        status: r.status,
        createdAt: r.createdAt,
        closedAt: r.closedAt || null,
        expiresAt: r.expiresAt,
        startTime: r.startTime,
        start_game_time: r.start_game_time || r.startGameTime || null
      }));

      console.log(`[Grafana API] Returning ${formatted.length} formatted items`);
      return new Response(JSON.stringify(formatted), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('[Grafana API] Error:', e);
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  if (url.pathname === '/api/grafana/recruits/history' && request.method === 'POST') {
    try {
      // Check Grafana access token for security
      const grafanaToken = env.GRAFANA_TOKEN;
      if (grafanaToken) {
        const providedToken = request.headers.get('x-grafana-token') || request.headers.get('authorization')?.replace('Bearer ', '');
        if (!providedToken || providedToken !== grafanaToken) {
          console.warn('[Grafana API] Unauthorized access attempt');
          return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
      let body = {}; try { body = await request.json(); } catch {}
      const range = body?.range || {};
      const toMs = range?.to ? Date.parse(range.to) : Date.now();
      const fromMs = range?.from ? Date.parse(range.from) : (toMs - 5*3600*1000);
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const target = new URL(`/api/recruits-history?from=${encodeURIComponent(new Date(fromMs).toISOString())}&to=${encodeURIComponent(new Date(toMs).toISOString())}`, request.url);
      const resp = await stub.fetch(new Request(target.toString(), { method: 'GET' }));
      const data = await resp.json();
      return new Response(JSON.stringify(data?.events || []), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('[Grafana history] Error:', e);
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  if (url.pathname === '/api/grafana/recruits/at' && request.method === 'POST') {
    try {
      // Check Grafana access token for security
      const grafanaToken = env.GRAFANA_TOKEN;
      if (grafanaToken) {
        const providedToken = request.headers.get('x-grafana-token') || request.headers.get('authorization')?.replace('Bearer ', '');
        if (!providedToken || providedToken !== grafanaToken) {
          console.warn('[Grafana API] Unauthorized access attempt');
          return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
      let body = {}; try { body = await request.json(); } catch {}
      const range = body?.range || {};
      const ts = range?.to ? Date.parse(range.to) : Date.now();
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const target = new URL(`/api/recruits-at?ts=${encodeURIComponent(new Date(ts).toISOString())}`, request.url);
      const resp = await stub.fetch(new Request(target.toString(), { method: 'GET' }));
      const data = await resp.json();
      return new Response(JSON.stringify(data?.items || []), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('[Grafana at] Error:', e);
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // RecruitsDO backed endpoints (proxy DO)
  if (url.pathname.startsWith('/api/recruits')) {
    try {
      if (READ_DO_ONLY_FOR_GRAFANA && !isGrafanaPath(url.pathname)) {
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const resp = await stub.fetch(request);
      const text = await resp.text();
      const contentType = resp.headers.get('content-type') || 'application/json';
      return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': contentType } });
    } catch (e) {
      console.error('[RecruitsDO proxy] Error:', e);
      if (typeof sendToSentry === 'function') { try { await sendToSentry(env, e, { path: url.pathname }, ctx); } catch (_) {} }
      return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // Bot -> Get active recruits for start time notifications
  if (url.pathname === '/api/active-recruits' && request.method === 'GET') {
    try {
      // Service token authentication
      const SERVICE_TOKEN = env.SERVICE_TOKEN || '';
      const authHeader = request.headers.get('authorization') || '';
      const serviceTokenHeader = request.headers.get('x-service-token') || '';
      
      const isAuthorized = SERVICE_TOKEN && (
        authHeader === `Bearer ${SERVICE_TOKEN}` ||
        serviceTokenHeader === SERVICE_TOKEN
      );
      
      if (!isAuthorized && SERVICE_TOKEN) {
        console.warn('[active-recruits] Unauthorized access attempt');
        return new Response(JSON.stringify({ error: 'unauthorized' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Fetch all recruits from Durable Object
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const listReq = new Request(new URL('/api/recruits', request.url).toString(), {
        method: 'GET',
        headers: { 'content-type': 'application/json' }
      });
      const resp = await stub.fetch(listReq);
      const data = await resp.json();
      const items = data.items || [];

      console.log(`[active-recruits] Total items from DO: ${items.length}`);

      // Filter for active recruits only
      const now = Date.now();
      const activeRecruits = items.filter(r => {
        const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
        const isActive = exp > now && r.status === 'recruiting';
        if (!isActive) {
          console.log(`[active-recruits] Filtered out: ${r.recruitId || r.id} (exp=${new Date(exp).toISOString()}, status=${r.status})`);
        }
        return isActive;
      });

      console.log(`[active-recruits] Returning ${activeRecruits.length} active recruits`);
      if (activeRecruits.length > 0) {
        console.log(`[active-recruits] Sample recruits:`, activeRecruits.slice(0, 2).map(r => ({
          id: r.recruitId || r.id,
          title: r.title,
          startTime: r.startTime,
          startTimeNotified: r.startTimeNotified,
          status: r.status,
          expiresAt: r.expiresAt
        })));
      }
      return new Response(JSON.stringify(activeRecruits), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.error('[active-recruits] Error:', e);
      if (typeof sendToSentry === 'function') { 
        try { await sendToSentry(env, e, { path: url.pathname }, ctx); } catch (_) {} 
      }
      return new Response(JSON.stringify({ error: 'internal_error' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
  }

  // Bot -> Backend push (auth by service token + UA gate)
  if (url.pathname === '/api/recruitment/push' && request.method === 'POST') {
    try {
      const SERVICE_TOKEN = env.SERVICE_TOKEN || '';
      const authHeader = request.headers.get('authorization') || '';
      const serviceTokenHeader = request.headers.get('x-service-token') || '';
      const userAgent = request.headers.get('user-agent') || '';
      const clientIP = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';

      if (!SERVICE_TOKEN) {
        return new Response(JSON.stringify({ error: 'service_unavailable' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let token = '';
      if (serviceTokenHeader) token = serviceTokenHeader.trim();
      else if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) token = authHeader.slice(7).trim();

      if (!token || token !== SERVICE_TOKEN) {
        console.warn(`[security] Unauthorized push attempt from IP: ${clientIP}, UA: ${userAgent}`);
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!userAgent.includes('node') && !userAgent.includes('discord')) {
        console.warn(`[security] Suspicious User-Agent from IP: ${clientIP}, UA: ${userAgent}`);
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const data = await request.json();
      if (!data.recruitId || !data.guildId) {
        return new Response(JSON.stringify({ error: 'invalid_data', detail: 'recruitId and guildId are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const sanitizedData = {
        recruitId: String(data.recruitId).slice(0, 50),
        guildId: String(data.guildId).slice(0, 20),
        channelId: String(data.channelId || '').slice(0, 20),
        message_id: String(data.message_id || '').slice(0, 20),
        status: String(data.status || 'recruiting').slice(0, 20),
        start_time: data.start_time || new Date().toISOString()
      };

      console.log(`[worker][recruitment-push] Authorized request from IP: ${clientIP}, recruitId: ${sanitizedData.recruitId}`);
      return new Response(JSON.stringify({ success: true, recruitId: sanitizedData.recruitId, guildId: sanitizedData.guildId, message: 'Data received successfully' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (err) {
      console.error('[worker][recruitment-push] Error:', err);
      return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // Dashboard public list
  if (url.pathname === '/api/dashboard/recruitment' && request.method === 'GET') {
    try {
      if (READ_DO_ONLY_FOR_GRAFANA) {
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'GET' }));
      const text = await resp.text();
      return new Response(text, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
      console.error('[GET] DO fetch error:', error);
      return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // Recruitment API (create/list via DO + optional Upstash cache)
  // Support both /api/recruitment (canonical) and /api/recruitments (for backward compatibility)
  if (url.pathname === '/api/recruitment' || url.pathname === '/api/recruitments') {
    const hasUpstash = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
    const redisPost = async (cmd) => {
      if (!hasUpstash) return null;
      try {
        const r = await fetch(env.UPSTASH_REDIS_REST_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
        return r.ok ? r.json() : null;
      } catch { return null; }
    };
    const setJson = async (key, obj, ttl) => { if (!hasUpstash) return; await redisPost(['SET', key, JSON.stringify(obj), 'EX', String(ttl || 8*3600)]); };
    const ttlHours = Number(env.RECRUITS_TTL_HOURS || 8);
    const ttlSec = ttlHours * 3600;

    if (request.method === 'POST') {
      try {
        const data = await request.json();
        const idDo = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(idDo);
        const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'POST', body: JSON.stringify(data) }));
        const bodyText = await resp.text();
        let parsed; try { parsed = JSON.parse(bodyText); } catch { parsed = { ok: false, raw: bodyText }; }
        if (parsed?.ok && data?.recruitId) {
          await setJson(`recruit:${data.recruitId}`, { ...data, createdAt: new Date().toISOString() }, ttlSec);
        }
        return new Response(JSON.stringify(parsed), { status: resp.status || 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('[POST]/api/recruitment error:', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (request.method === 'GET') {
      try {
        if (READ_DO_ONLY_FOR_GRAFANA) {
          return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const idDo = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(idDo);
        const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'GET' }));
        const text = await resp.text();
        return new Response(text, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('[GET]/api/recruitment error:', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  // Update status via PATCH to DO
  // Support both /api/recruitment/{id} (canonical) and /api/recruitments/{id} (backward compatibility)
  const isPatchPath = (url.pathname.startsWith('/api/recruitment/') || url.pathname.startsWith('/api/recruitments/')) && request.method === 'PATCH';
  if (isPatchPath) {
    const pathPrefix = url.pathname.startsWith('/api/recruitments/') ? '/api/recruitments/' : '/api/recruitment/';
    const messageId = url.pathname.split(pathPrefix)[1];
    if (!messageId) {
      return new Response(JSON.stringify({ error: 'Message ID required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    try {
      const updateData = await request.json();
      const idDo = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(idDo);
      const resp = await stub.fetch(new Request(new URL(`/api/recruits/${encodeURIComponent(messageId)}`, url).toString(), { method: 'PATCH', body: JSON.stringify(updateData) }));
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
      console.error('[PATCH] Error updating via DO:', error);
      return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // Single get/delete
  // Support both /api/recruitment/{id} (canonical) and /api/recruitments/{id} (backward compatibility)
  const isRecruitmentPath = url.pathname.startsWith('/api/recruitment/') || url.pathname.startsWith('/api/recruitments/');
  if (isRecruitmentPath && (request.method === 'GET' || request.method === 'DELETE')) {
    const pathPrefix = url.pathname.startsWith('/api/recruitments/') ? '/api/recruitments/' : '/api/recruitment/';
    const rid = url.pathname.split(pathPrefix)[1];
    if (!rid) {
      return new Response(JSON.stringify({ error: 'Message ID required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const method = request.method;
    const hasUpstash = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
    const redisPost = async (cmd) => {
      if (!hasUpstash) return null;
      try {
        const r = await fetch(env.UPSTASH_REDIS_REST_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
        return r.ok ? r.json() : null;
      } catch { return null; }
    };

    if (method === 'GET') {
      if (hasUpstash) {
        const res = await redisPost(['GET', `recruit:${rid}`]);
        if (res && res.result) {
          try { return new Response(res.result, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}
        }
      }
      if (READ_DO_ONLY_FOR_GRAFANA) {
        return new Response(JSON.stringify({ error: 'restricted', message: 'DO read disabled outside Grafana' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const idDo = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(idDo);
      const resp = await stub.fetch(new Request(new URL(`/api/recruits/${encodeURIComponent(rid)}`, url).toString(), { method: 'GET' }));
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (method === 'DELETE') {
      const body = await request.text();
      const idDo = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(idDo);
      const resp = await stub.fetch(new Request(new URL(`/api/recruits/${encodeURIComponent(rid)}`, url).toString(), { method: 'DELETE', body }));
      const text = await resp.text();
      if (hasUpstash) { await redisPost(['DEL', `recruit:${rid}`]); }
      return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // Bot -> Recruit status endpoints (for notification tracking)
  if (url.pathname === '/api/recruit-status') {
    if (request.method === 'POST') {
      try {
        const data = await request.json();
        const { serverId, channelId, messageId, startTime } = data;
        console.log('[recruit-status] POST:', { serverId, channelId, messageId, startTime });
        // This endpoint stores notification metadata - currently a no-op since we use DO for the source of truth
        return new Response(JSON.stringify({ ok: true, message: 'Status recorded' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.error('[recruit-status] POST error:', e);
        return new Response(JSON.stringify({ error: 'invalid_request' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (request.method === 'DELETE') {
      try {
        const serverId = url.searchParams.get('serverId');
        console.log('[recruit-status] DELETE:', { serverId });
        // This endpoint clears notification metadata - currently a no-op
        return new Response(JSON.stringify({ ok: true, message: 'Status cleared' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.error('[recruit-status] DELETE error:', e);
        return new Response(JSON.stringify({ error: 'internal_error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
  }

  return null;
}
