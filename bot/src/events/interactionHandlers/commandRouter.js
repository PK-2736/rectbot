/**
 * commandRouter.js
 * Handles command execution routing
 */

const { handleCommandSafely } = require('../../utils/interactionHandler');

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
      deferOptions: { ephemeral: true } 
    }
  );
}

module.exports = {
  routeCommand
};
