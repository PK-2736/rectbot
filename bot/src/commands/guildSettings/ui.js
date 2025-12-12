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
const { safeRespond } = require('../../utils/interactionHandler');

function addSafeSection(container, builder, fallbackText) {
  try {
    try {
      if (Object.prototype.hasOwnProperty.call(builder, 'accessory') && builder.accessory === undefined) {
        delete builder.accessory;
      }
      if (Object.prototype.hasOwnProperty.call(builder, 'thumbnail') && builder.thumbnail === undefined) {
        delete builder.thumbnail;
      }
    } catch (sanitizeErr) {
      // ignore sanitize errors
    }
    builder.toJSON();
    container.addSectionComponents(builder);
  } catch (sectionErr) {
    console.warn('[guildSettings] Section validation failed; using fallback text-only section', { fallbackText, err: sectionErr?.message || sectionErr });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fallbackText));
  }
}

async function showSettingsUI(interaction, settings = {}, isAdmin = false) {
  const container = new ContainerBuilder();
  container.setAccentColor(0x5865F2);

  console.log('[guildSettings:showSettingsUI] isAdmin:', !!isAdmin);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`⚙️ **ギルド募集設定**${isAdmin ? '' : ' (閲覧モード)'}`)
  );

  const recruitChannels = Array.isArray(settings.recruit_channels)
    ? settings.recruit_channels.filter(Boolean).map(String)
    : [];
  const recruitChannelValue = (() => {
    if (recruitChannels.length > 0) return recruitChannels.slice(0, 2).map(id => `<#${id}>`).join(', ') + (recruitChannels.length > 2 ? ` +${recruitChannels.length - 2}` : '');
    if (settings.recruit_channel || settings.recruitmentChannelId) return `<#${settings.recruit_channel || settings.recruitmentChannelId}>`;
    return '未設定';
  })();

  // 通知ロール集計
  const notificationRoles = (() => {
    const roles = [];
    if (Array.isArray(settings.notification_roles)) roles.push(...settings.notification_roles.filter(Boolean));
    if (roles.length === 0 && settings.notification_role) roles.push(settings.notification_role);
    if (roles.length === 0 && settings.recruitmentNotificationRoleId) roles.push(settings.recruitmentNotificationRoleId);
    return [...new Set(roles.map(String))];
  })();

  const specialMentions = notificationRoles.filter(r => r === 'everyone' || r === 'here');
  const actualRoles = notificationRoles.filter(r => r !== 'everyone' && r !== 'here');
  const notificationRoleValue = (() => {
    const lines = [];
    if (specialMentions.includes('everyone')) lines.push('@everyone');
    if (specialMentions.includes('here')) lines.push('@here');
    lines.push(...actualRoles.slice(0, 2).map(roleId => `<@&${roleId}>`));
    if (actualRoles.length > 2) lines.push(`+${actualRoles.length - 2}`);
    return lines.length > 0 ? lines.join(', ') : '未設定';
  })();

  const updateChannelValue = (settings.update_channel || settings.updateNotificationChannelId) 
    ? `<#${settings.update_channel || settings.updateNotificationChannelId}>` 
    : '未設定';

  const defaultTitleValue = settings.defaultTitle || settings.defaultRecruitTitle || '参加者募集';
  const defaultColorValue = settings.defaultColor || settings.defaultRecruitColor || '未設定';
  const styleValue = (settings?.recruit_style === 'simple') ? 'シンプル' : '画像パネル';
  const dedicatedStatus = !!settings.enable_dedicated_channel ? '✅ オン' : '⭕ オフ';

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // ===== 📍 チャンネル設定 =====
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('📍 **チャンネル設定**')
  );
  
  const channelInfo = `募集: ${recruitChannelValue}\n通知: ${updateChannelValue}`;
  if (isAdmin) {
    const channelSection = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(channelInfo));
    const btn = new ButtonBuilder().setCustomId('set_recruit_channels').setLabel('募集').setStyle(ButtonStyle.Primary);
    try {
      channelSection.setButtonAccessory(btn);
    } catch (_) {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
    }
    addSafeSection(container, channelSection, channelInfo);
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('set_update_channel').setLabel('通知').setStyle(ButtonStyle.Secondary),
        dedicatedStatus.includes('オン') ? new ButtonBuilder().setCustomId('set_dedicated_category').setLabel('カテゴリ').setStyle(ButtonStyle.Secondary) : new ButtonBuilder().setLabel('非表示').setStyle(ButtonStyle.Secondary).setDisabled(true)
      )
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(channelInfo));
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // ===== 🔔 通知設定 =====
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('🔔 **通知設定**')
  );

  if (isAdmin) {
    const roleSection = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(notificationRoleValue));
    const btn = new ButtonBuilder().setCustomId('set_notification_role').setLabel('設定').setStyle(ButtonStyle.Primary);
    try {
      roleSection.setButtonAccessory(btn);
    } catch (_) {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
    }
    addSafeSection(container, roleSection, notificationRoleValue);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(notificationRoleValue));
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // ===== 🎨 表示設定 =====
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('🎨 **表示設定**')
  );

  const displayInfo = `タイトル: ${defaultTitleValue}\nカラー: ${defaultColorValue}\nスタイル: ${styleValue}`;
  if (isAdmin) {
    const displaySection = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(displayInfo));
    const btn = new ButtonBuilder().setCustomId('set_default_title').setLabel('タイトル').setStyle(ButtonStyle.Primary);
    try {
      displaySection.setButtonAccessory(btn);
    } catch (_) {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
    }
    addSafeSection(container, displaySection, displayInfo);
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('set_default_color').setLabel('カラー').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('toggle_recruit_style').setLabel(styleValue).setStyle(ButtonStyle.Secondary)
      )
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(displayInfo));
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // ===== 📂 機能設定 =====
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`📂 **機能設定**\n専用チャンネルボタン: ${dedicatedStatus}`)
  );

  if (isAdmin) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('toggle_dedicated_channel').setLabel('オン/オフ').setStyle(ButtonStyle.Primary)
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  // ===== 操作ボタン =====
  if (isAdmin) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('finalize_settings').setLabel('保存').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('reset_all_settings').setLabel('リセット').setStyle(ButtonStyle.Danger).setEmoji('🔄')
      )
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('🔒 管理者権限が必要です')
    );
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('powered by **Recrubo**'))

  const replyOptions = {
    content: '　',
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  };

  // Validate the container (to capture builder validation errors early and fall back)
  try {
    // container.toJSON() will validate internal structure; call it to trigger any builder validation errors
    // eslint-disable-next-line no-unused-expressions
    container.toJSON();
  } catch (validateErr) {
    console.error('[guildSettings] Container validation failed, falling back to plain text reply', validateErr);
    await safeRespond(interaction, { content: '⚠️ 設定の表示に失敗しました。管理者にお問い合わせください。', flags: MessageFlags.Ephemeral });
    return;
  }

  await safeRespond(interaction, replyOptions);

  setTimeout(async () => {
    try { await interaction.deleteReply(); } catch (error) {
      console.log('[guildSettings] メッセージの自動削除に失敗（既に削除済みの可能性）:', error.message);
    }
  }, 5 * 60 * 1000);
}

async function showChannelSelect(interaction, settingType, placeholder, { maxValues = 1, channelTypes = [ChannelType.GuildText] } = {}) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`channel_select_${settingType}`)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(Math.min(25, Math.max(1, maxValues)))
    .addChannelTypes(...channelTypes);
  const actionRow = new ActionRowBuilder().addComponents(channelSelect);
  try {
    await safeRespond(interaction, { content: placeholder, components: [actionRow], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('[guildSettings] showChannelSelect error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeRespond(interaction, { content: '❌ チャンネル選択メニューの表示に失敗しました。時間を置いて再度お試しください。', flags: MessageFlags.Ephemeral });
    }
  }
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
    if (actualRoles[0]) roleSelect.setDefaultRoles(...[actualRoles[0]]);
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
    await safeRespond(interaction, { 
      content: `${placeholder}\n\n💡 **ヒント**: @everyone/@hereは下のボタンで切り替えできます`, 
      components: actionRows, 
      flags: MessageFlags.Ephemeral 
    });
    
  } catch (error) {
    console.error('[guildSettings] showRoleSelect response error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeRespond(interaction, { content: '❌ ロール選択メニューの表示に失敗しました。時間を置いて再度お試しください。', flags: MessageFlags.Ephemeral });
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
