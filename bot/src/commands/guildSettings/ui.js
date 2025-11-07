const {
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  ChannelType, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SectionBuilder
} = require('discord.js');

const { getGuildSettingsFromRedis } = require('../../utils/db');
const { safeReply } = require('../../utils/safeReply');

async function showSettingsUI(interaction, settings = {}) {
  const container = new ContainerBuilder();
  container.setAccentColor(0x5865F2);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('⚙️✨ **ギルド募集設定** ✨⚙️')
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  const recruitChannelValue = settings.recruit_channel || settings.recruitmentChannelId 
    ? `<#${settings.recruit_channel || settings.recruitmentChannelId}>` 
    : '未設定';

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`📍 **募集チャンネル**\n${recruitChannelValue}`)
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('set_recruit_channel').setLabel('設定変更').setStyle(ButtonStyle.Primary)
      )
  );

  const notificationRoles = (() => {
    const roles = [];
    if (Array.isArray(settings.notification_roles)) roles.push(...settings.notification_roles.filter(Boolean));
    if (roles.length === 0 && settings.notification_role) roles.push(settings.notification_role);
    if (roles.length === 0 && settings.recruitmentNotificationRoleId) roles.push(settings.recruitmentNotificationRoleId);
    return [...new Set(roles.map(String))];
  })();

  const notificationRoleValue = notificationRoles.length > 0
    ? notificationRoles.map(roleId => `<@&${roleId}>`).join('\n')
    : '未設定';

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔔 **通知ロール**\n${notificationRoleValue}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId('set_notification_role').setLabel('設定変更').setStyle(ButtonStyle.Primary))
  );

  const defaultTitleValue = settings.defaultTitle || settings.defaultRecruitTitle || '未設定';
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`📝 **既定タイトル**\n${defaultTitleValue}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId('set_default_title').setLabel('設定変更').setStyle(ButtonStyle.Primary))
  );

  const defaultColorValue = settings.defaultColor || settings.defaultRecruitColor || '未設定';
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎨 **既定カラー**\n${defaultColorValue}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId('set_default_color').setLabel('設定変更').setStyle(ButtonStyle.Primary))
  );

  const updateChannelValue = settings.update_channel || settings.updateNotificationChannelId 
    ? `<#${settings.update_channel || settings.updateNotificationChannelId}>` 
    : '未設定';

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`📢 **アップデート通知チャンネル**\n${updateChannelValue}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId('set_update_channel').setLabel('設定変更').setStyle(ButtonStyle.Primary))
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('finalize_settings').setLabel('設定完了').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId('reset_all_settings').setLabel('すべてリセット').setStyle(ButtonStyle.Danger).setEmoji('🔄')
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('powered by **RectBot**'))

  const replyOptions = {
    content: '　',
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  };

  await safeReply(interaction, replyOptions);

  setTimeout(async () => {
    try { await interaction.deleteReply(); } catch (error) {
      console.log('[guildSettings] メッセージの自動削除に失敗（既に削除済みの可能性）:', error.message);
    }
  }, 5 * 60 * 1000);
}

async function showChannelSelect(interaction, settingType, placeholder) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`channel_select_${settingType}`)
    .setPlaceholder(placeholder)
    .addChannelTypes(ChannelType.GuildText);
  const actionRow = new ActionRowBuilder().addComponents(channelSelect);
  await safeReply(interaction, { content: placeholder, components: [actionRow], flags: MessageFlags.Ephemeral });
}

async function showRoleSelect(interaction, settingType, placeholder) {
  const currentSettings = await getGuildSettingsFromRedis(interaction.guildId);
  const selectedRoles = (() => {
    const roles = [];
    if (Array.isArray(currentSettings.notification_roles)) roles.push(...currentSettings.notification_roles.filter(Boolean));
    if (roles.length === 0 && currentSettings.notification_role) roles.push(currentSettings.notification_role);
    if (roles.length === 0 && currentSettings.recruitmentNotificationRoleId) roles.push(currentSettings.recruitmentNotificationRoleId);
    return [...new Set(roles.map(String))];
  })();

  const maxValues = Math.min(25, Math.max(1, selectedRoles.length, 5));

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`role_select_${settingType}`)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(maxValues);

  if (selectedRoles.length > 0 && typeof roleSelect.setDefaultRoles === 'function') {
    roleSelect.setDefaultRoles(...selectedRoles.slice(0, 25));
  }

  const actionRow = new ActionRowBuilder().addComponents(roleSelect);
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: placeholder, components: [actionRow], ephemeral: true });
    } else {
      await safeReply(interaction, { content: placeholder, components: [actionRow], ephemeral: true });
    }
  } catch (error) {
    console.error('[guildSettings] showRoleSelect response error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ ロール選択メニューの表示に失敗しました。時間を置いて再度お試しください。', ephemeral: true });
    }
  }
}

async function showTitleModal(interaction) {
  const modal = new ModalBuilder().setCustomId('default_title_modal').setTitle('📝 既定タイトル設定');
  const titleInput = new TextInputBuilder()
    .setCustomId('default_title')
    .setLabel('既定のタイトルを入力してください')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setPlaceholder('例: ゲーム募集 | {ゲーム名}');
  modal.addComponents(new ActionRowBuilder().addComponents(titleInput));
  await interaction.showModal(modal);
}

async function showColorModal(interaction) {
  const modal = new ModalBuilder().setCustomId('default_color_modal').setTitle('🎨 既定カラー設定');
  const colorInput = new TextInputBuilder()
    .setCustomId('default_color')
    .setLabel('カラーコードを入力してください（#なし）')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(6)
    .setMinLength(6)
    .setPlaceholder('例: 5865F2');
  modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
  await interaction.showModal(modal);
}

module.exports = {
  showSettingsUI,
  showChannelSelect,
  showRoleSelect,
  showTitleModal,
  showColorModal,
};
