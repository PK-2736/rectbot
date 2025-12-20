const { getSupabase } = require('./supabase');

// Supabase table name for recruit templates
const TABLE_NAME = 'recruit_templates';

function normalizeHex(color) {
  if (!color) return null;
  let c = String(color).trim();
  if (c.startsWith('#')) c = c.slice(1);
  if (!/^[0-9A-Fa-f]{6}$/.test(c)) return null;
  return c.toUpperCase();
}

function normalizeRole(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (raw.toLowerCase() === '@everyone' || raw === 'everyone') return 'everyone';
  if (raw.toLowerCase() === '@here' || raw === 'here') return 'here';
  const match = raw.match(/^(?:<@&)?(\d+)>?$/);
  if (match) return match[1];
  return null;
}

async function upsertTemplate({
  guildId,
  createdBy,
  name,
  title,
  participants,
  color,
  notificationRoleId,
  content,
  startTimeText,
  regulationMembers,
  voicePlace,
  voiceOption,
}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase client is not configured');

  const insert = {
    guild_id: guildId,
    name: name?.trim().slice(0, 100),
    title: title?.trim().slice(0, 150),
    participants: participants ?? null,
    color: normalizeHex(color),
    notification_role_id: normalizeRole(notificationRoleId),
    content: content?.trim() || null,
    start_time_text: startTimeText?.trim() || null,
    regulation_members: regulationMembers ?? null,
    voice_place: voicePlace?.trim() || null,
    voice_option: voiceOption?.trim() || null,
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(insert, { onConflict: 'guild_id,name' })
    .select()
    .maybeSingle();

  if (error) {
    error.message = `[upsertTemplate] ${error.message}`;
    throw error;
  }
  return data;
}

async function listTemplates(guildId, search) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase client is not configured');
  let query = supabase.from(TABLE_NAME).select('*').eq('guild_id', guildId).order('updated_at', { ascending: false }).limit(20);
  if (search && search.trim().length > 0) {
    query = query.ilike('name', `%${search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) {
    error.message = `[listTemplates] ${error.message}`;
    throw error;
  }
  return data || [];
}

async function getTemplateByName(guildId, name) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase client is not configured');
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('guild_id', guildId)
    .eq('name', name)
    .maybeSingle();
  if (error) {
    error.message = `[getTemplateByName] ${error.message}`;
    throw error;
  }
  return data;
}

module.exports = {
  upsertTemplate,
  listTemplates,
  getTemplateByName,
};
