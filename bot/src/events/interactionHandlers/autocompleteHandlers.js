/**
 * autocompleteHandlers.js
 * Handles autocomplete interactions
 */

/**
 * Get title autocomplete suggestions
 */
async function getTitleSuggestions(interaction) {
  try {
    const { getGuildSettings } = require('../../utils/database');
    const settings = await getGuildSettings(interaction.guildId).catch(() => null);
    const focused = interaction.options.getFocused(true);
    
    if (settings?.defaultTitle && (!focused.value || settings.defaultTitle.includes(focused.value))) {
      return [{ name: `既定: ${settings.defaultTitle}`, value: settings.defaultTitle }];
    }
  } catch (error) {
    console.warn('[getTitleSuggestions] error:', error);
  }
  return [];
}

/**
 * Get template autocomplete suggestions
 */
async function getTemplateSuggestions(interaction) {
  const focused = interaction.options.getFocused(true);
  const q = String(focused?.value || '').trim();

  try {
    const { listTemplates } = require('../../utils/database');
    const templates = await listTemplates(interaction.guildId, q).catch(() => []);
    if (Array.isArray(templates) && templates.length > 0) {
      return templates
        .filter(t => t && t.name)
        .slice(0, 25)
        .map(t => ({ name: String(t.name).slice(0, 100), value: String(t.name).slice(0, 100) }));
    }
  } catch (error) {
    console.warn('[getTemplateSuggestions] local list failed:', error?.message || error);
  }

  try {
    const backendFetch = require('../../utils/common/backendFetch');
    const params = new URLSearchParams({ guildId: String(interaction.guildId || '') });
    if (q) params.set('search', q);
    const resp = await backendFetch(`/api/plus/bot/templates?${params.toString()}`, { method: 'GET' });
    const templates = Array.isArray(resp?.templates) ? resp.templates : [];
    return templates
      .filter(t => t && t.name)
      .slice(0, 25)
      .map(t => ({ name: String(t.name).slice(0, 100), value: String(t.name).slice(0, 100) }));
  } catch (error) {
    console.warn('[getTemplateSuggestions] backend list failed:', error?.message || error);
  }

  return [];
}

/**
 * Get start time autocomplete suggestions
 */
function getStartTimeSuggestions(interaction) {
  const focused = interaction.options.getFocused(true);
  const value = (focused.value || '').toLowerCase();
  const shouldSuggest = !value || ['いま', '今', 'ima', 'now'].some(k => value.includes(k));
  
  if (shouldSuggest) {
    return [{ name: '今から', value: '今から' }];
  }
  
  return [];
}

/**
 * Main autocomplete handler
 */
async function handleAutocomplete(interaction, client) {
  try {
    // Try command-specific autocomplete first
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      await command.autocomplete(interaction);
      return;
    }

    // Fallback to generic autocomplete
    const focused = interaction.options.getFocused(true);
    let choices = [];
    
    // Title suggestions
    if (focused?.name === 'タイトル') {
      choices = await getTitleSuggestions(interaction);
    }
    
    // Start time suggestions
    if (focused?.name === '開始時間') {
      choices = getStartTimeSuggestions(interaction);
    }

    // Template suggestions
    if (focused?.name === 'テンプレート' || focused?.name === 'template') {
      choices = await getTemplateSuggestions(interaction);
    }
    
    await interaction.respond(choices.slice(0, 10));
  } catch (error) {
    console.warn('[handleAutocomplete] autocomplete error:', error?.message || error);
  }
}

module.exports = {
  handleAutocomplete,
  getTitleSuggestions,
  getStartTimeSuggestions,
  getTemplateSuggestions
};
