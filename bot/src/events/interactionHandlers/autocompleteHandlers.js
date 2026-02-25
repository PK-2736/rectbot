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
    
    await interaction.respond(choices.slice(0, 10));
  } catch (error) {
    console.warn('[handleAutocomplete] autocomplete error:', error?.message || error);
  }
}

module.exports = {
  handleAutocomplete,
  getTitleSuggestions,
  getStartTimeSuggestions
};
