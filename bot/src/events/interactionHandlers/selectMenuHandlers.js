/**
 * selectMenuHandlers.js
 * Handles all select menu interactions (String, Role, Channel)
 */

const { MessageFlags } = require('discord.js');
const { safeRespond, handleComponentSafely } = require('../../utils/interactionHandler');

// ギルド設定コマンド解決ヘルパー（setting が優先）
function getGuildSettingsCommand(client) {
  return client.commands.get('setting') || client.commands.get('rect-setting');
}

/**
 * Handle string select menu interactions
 */
async function handleStringSelectMenu(interaction, client) {
  // Guild settings select menus
  if (interaction.customId?.startsWith('channel_select_') || 
      interaction.customId?.startsWith('role_select_') || 
      interaction.customId === 'settings_category_menu') {
    const guildSettings = getGuildSettingsCommand(client);
    if (guildSettings?.handleSelectMenuInteraction) {
      await handleComponentSafely(interaction, () => guildSettings.handleSelectMenuInteraction(interaction));
    } else {
      await safeRespond(interaction, { 
        content: '設定ハンドラが見つかりませんでした。', 
        flags: MessageFlags.Ephemeral 
      }).catch(() => {});
    }
    return;
  }

  // Help command select menu
  if (interaction.customId === 'help_command_select') {
    const helpCommand = client.commands.get('help');
    if (helpCommand?.handleSelectMenu) {
      await handleComponentSafely(interaction, () => helpCommand.handleSelectMenu(interaction));
    }
    return;
  }

  // Subscription guild select menu
  if (interaction.customId?.startsWith('subscription_guild_select:')) {
    const subscriptionCommand = client.commands.get('subscription');
    if (subscriptionCommand?.handleSelectMenu) {
      await handleComponentSafely(interaction, () => subscriptionCommand.handleSelectMenu(interaction));
    }
  }
}

/**
 * Handle role/channel select menu interactions
 */
async function handleRoleOrChannelSelectMenu(interaction, client) {
  if (interaction.customId?.startsWith('channel_select_') || 
      interaction.customId?.startsWith('role_select_')) {
    const guildSettings = getGuildSettingsCommand(client);
    if (guildSettings?.handleSelectMenuInteraction) {
      try {
        await guildSettings.handleSelectMenuInteraction(interaction);
      } catch (error) {
        console.error('[handleRoleOrChannelSelectMenu] select menu error:', error);
        await safeRespond(interaction, { 
          content: 'メニュー処理でエラーが発生しました。', 
          flags: MessageFlags.Ephemeral 
        }).catch(() => {});
      }
    } else {
      await safeRespond(interaction, { 
        content: '設定ハンドラが見つかりませんでした。', 
        flags: MessageFlags.Ephemeral 
      }).catch(() => {});
    }
  }
}

module.exports = {
  handleStringSelectMenu,
  handleRoleOrChannelSelectMenu
};
