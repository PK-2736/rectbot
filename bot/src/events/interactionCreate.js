/**
 * interactionCreate event handler
 * Simplified main router - delegates to specialized handlers
 */

const { deduplicateInteraction } = require('./interactionHandlers/deduplication');
const { handleAutocomplete } = require('./interactionHandlers/autocompleteHandlers');
const { routeCommand } = require('./interactionHandlers/commandRouter');
const { handleModalInteraction } = require('./interactionHandlers/modalHandlers');
const { handleButtonInteraction } = require('./interactionHandlers/buttonHandlers');
const { handleStringSelectMenu, handleRoleOrChannelSelectMenu } = require('./interactionHandlers/selectMenuHandlers');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // Deduplication check
    if (deduplicateInteraction(client, interaction)) {
      return; // Skip duplicate
    }

    // Route to appropriate handler based on interaction type
    try {
      // Autocomplete
      if (interaction.isAutocomplete?.()) {
        await handleAutocomplete(interaction, client);
        return;
      }

      // Slash commands
      if (interaction.isChatInputCommand?.()) {
        await routeCommand(interaction, client);
        return;
      }

      // String select menus
      if (interaction.isStringSelectMenu?.()) {
        await handleStringSelectMenu(interaction, client);
        return;
      }

      // Role/Channel select menus
      if (interaction.isRoleSelectMenu?.() || interaction.isChannelSelectMenu?.()) {
        await handleRoleOrChannelSelectMenu(interaction, client);
        return;
      }

      // Modal submissions
      if (interaction.isModalSubmit?.() || interaction.type === 5) {
        await handleModalInteraction(interaction, client);
        return;
      }

      // Buttons
      if (interaction.isButton?.()) {
        await handleButtonInteraction(interaction, client);
        return;
      }
    } catch (error) {
      console.error('[interactionCreate] Execution error:', error);
    }
  },
};
