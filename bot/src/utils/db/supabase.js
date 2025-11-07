const { createClient } = require('@supabase/supabase-js');
const config = require('../../config');

let _supabaseClient = null;

function getSupabase() {
  if (_supabaseClient) return _supabaseClient;
  try {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('getSupabase: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
      return null;
    }
    _supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
    return _supabaseClient;
  } catch (e) {
    console.warn('getSupabase: failed to create client', e?.message || e);
    return null;
  }
}

module.exports = { getSupabase };
