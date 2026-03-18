/**
 * commandRouter.js
 * Handles command execution routing
 */

const { handleCommandSafely } = require('../../utils/interactionHandler');
const { MessageFlags } = require('discord.js');

/**
 * Route and execute slash commands
 */
async function routeCommand(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  
  const deferNeeded = !command.noDefer;
  await handleCommandSafely(
    interaction,
    async (inter) => {
      await command.execute(inter);
    },
    { 
      defer: deferNeeded, 
      deferOptions: { flags: MessageFlags.Ephemeral } 
    }
  );
}

module.exports = {
  routeCommand
};
