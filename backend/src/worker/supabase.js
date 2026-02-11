// Supabase utilities extracted from index.js for reuse across routes

function isSupabaseHost(value) {
  try { return new URL(value).host.endsWith('.supabase.co'); } catch { return false; }
}

function collectRawCandidates(env) {
  return [
    env.SUPABASE_URL,
    env.SUPABASE_REST_URL,
    env.PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.VITE_SUPABASE_URL,
    env.SUPABASE_PROJECT_URL,
  ].filter(v => typeof v === 'string' && v.trim() !== '');
}

function deriveFromProjectRef(env) {
  return env.SUPABASE_PROJECT_REF
    ? `https://${String(env.SUPABASE_PROJECT_REF).trim()}.supabase.co`
    : null;
}

function buildCandidates(env) {
  const derived = deriveFromProjectRef(env);
  const rawCandidates = collectRawCandidates(env);
  const candidates = [];
  if (derived) candidates.push(derived);

  for (const value of rawCandidates) {
    if (isSupabaseHost(value)) candidates.push(value);
  }

  const allowNonSupabase = String(env.ALLOW_NON_SUPABASE_URL || '').toLowerCase() === 'true';
  if (allowNonSupabase) {
    for (const value of rawCandidates) {
      if (!isSupabaseHost(value)) candidates.push(value);
    }
  }

  return candidates;
}

function pickFirstCandidate(candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.replace(/\/+$/, '');
    }
  }
  return null;
}

export function resolveSupabaseRestUrl(env) {
  return pickFirstCandidate(buildCandidates(env));
}

export function buildSupabaseHeaders(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role key is not configured');
  }
  return {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export function getSupabaseClient(env) {
  const supabaseUrl = resolveSupabaseRestUrl(env);
  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured');
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role key is not configured');
  }
  // Minimal fetch-based client (keep parity with original inline client)
  return {
    from: (table) => ({
      upsert: async (data) => {
        const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
          method: 'POST',
          headers: buildSupabaseHeaders(env),
          body: JSON.stringify(data)
        });
        return res.json();
      },
      select: async (columns) => {
        const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}`, {
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        return res.json();
      }
    })
  };
}

// Lightweight ping to Supabase to wake free-tier projects.
// Returns true if a response is received (any status), false on network/timeout error.
export async function pingSupabase(env, timeoutMs = 3000) {
  try {
    const supabaseRestUrl = resolveSupabaseRestUrl(env);
    if (!supabaseRestUrl || !env.SUPABASE_SERVICE_ROLE_KEY) return false;

    const target = `${supabaseRestUrl.replace(/\/+$/, '')}/rest/v1/guild_settings?select=*&limit=1`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(target, {
        method: 'GET',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        signal: controller.signal,
      });
      clearTimeout(id);
      return true;
    } catch (_e) {
      clearTimeout(id);
      return false;
    }
  } catch (_e) {
    return false;
  }
}
