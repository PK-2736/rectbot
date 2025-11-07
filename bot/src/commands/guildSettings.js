const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  execute,
  handleButtonInteraction,
  handleSelectMenuInteraction,
  handleModalSubmit,
  updateGuildSetting,
  finalizeSettingsHandler,
  resetAllSettings,
} = require('./guildSettings/handlers');
const { showSettingsUI, showChannelSelect, showRoleSelect, showTitleModal, showColorModal } = require('./guildSettings/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setting')
    .setDescription('募集設定を管理します（/setting）')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // Handlers
  execute,
  handleButtonInteraction,
  handleSelectMenuInteraction,
  handleModalSubmit,
  updateGuildSetting,
  finalizeSettings: finalizeSettingsHandler,
  resetAllSettings,

  // UI helpers (exported for completeness/testing; not required by command router directly)
  showSettingsUI,
  showChannelSelect,
  showRoleSelect,
  showTitleModal,
  showColorModal,
};