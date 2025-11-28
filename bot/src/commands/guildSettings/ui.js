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

  // everyone/here と実際のロールを分離
  const specialMentions = notificationRoles.filter(r => r === 'everyone' || r === 'here');
  const actualRoles = notificationRoles.filter(r => r !== 'everyone' && r !== 'here');

  const notificationRoleLines = [];
  if (specialMentions.includes('everyone')) notificationRoleLines.push('@everyone');
  if (specialMentions.includes('here')) notificationRoleLines.push('@here');
  if (actualRoles.length > 0) {
    notificationRoleLines.push(...actualRoles.map(roleId => `<@&${roleId}>`));
  }
  const notificationRoleValue = notificationRoleLines.length > 0
    ? notificationRoleLines.join('\n')
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

  // everyone/here と実際のロールを分離
  const hasEveryone = selectedRoles.includes('everyone');
  const hasHere = selectedRoles.includes('here');
  const actualRoles = selectedRoles.filter(r => r !== 'everyone' && r !== 'here');

  const maxValues = Math.min(25, Math.max(1, actualRoles.length || 5));

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`role_select_${settingType}`)
    .setPlaceholder('通知するロールを選択')
    .setMinValues(0)
    .setMaxValues(maxValues);

  // 実際のロールIDのうち、主要な1つのみをdefaultに設定（以前はすべてプリセットされていた）
  if (actualRoles.length > 0 && typeof roleSelect.setDefaultRoles === 'function') {
    // 管理者が間違ってすべてプリセットされていた既存の挙動を修正し、
    // 現在のprimary通知ロール（先頭）だけを初期選択にする
    roleSelect.setDefaultRoles(...[actualRoles[0]]);
  }

  const actionRows = [new ActionRowBuilder().addComponents(roleSelect)];

  // @everyone/@here トグルボタンを追加
  const specialButtonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('toggle_everyone')
      .setLabel('@everyone')
      .setStyle(hasEveryone ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji(hasEveryone ? '✅' : '⬜'),
    new ButtonBuilder()
      .setCustomId('toggle_here')
      .setLabel('@here')
      .setStyle(hasHere ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji(hasHere ? '✅' : '⬜')
  );
  actionRows.push(specialButtonRow);

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: `${placeholder}\n\n💡 **ヒント**: @everyone/@hereは下のボタンで切り替えできます`, 
        components: actionRows, 
        flags: MessageFlags.Ephemeral 
      });
    } else {
      await safeReply(interaction, { 
        content: `${placeholder}\n\n💡 **ヒント**: @everyone/@hereは下のボタンで切り替えできます`, 
        components: actionRows, 
        flags: MessageFlags.Ephemeral 
      });
    }
  } catch (error) {
    console.error('[guildSettings] showRoleSelect response error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ ロール選択メニューの表示に失敗しました。時間を置いて再度お試しください。', flags: MessageFlags.Ephemeral });
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
