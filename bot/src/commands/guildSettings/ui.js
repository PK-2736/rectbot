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

async function showSettingsUI(interaction, settings = {}, isAdmin = false) {
  const container = new ContainerBuilder();
  container.setAccentColor(0x5865F2);

  console.log('[guildSettings:showSettingsUI] isAdmin:', !!isAdmin);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`⚙️✨ **ギルド募集設定${isAdmin ? '' : ' (閲覧モード)'}** ✨⚙️`)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  const recruitChannelValue = settings.recruit_channel || settings.recruitmentChannelId 
    ? `<#${settings.recruit_channel || settings.recruitmentChannelId}>` 
    : '未設定';

  function addSafeSection(container, builder, fallbackText) {
    // NOTE: discord.js SectionBuilder's accessory union validator will throw when
    // the accessory field is present but undefined. To avoid this library validation
    // error (CombinedError), we only build SectionBuilder sections for admin users
    // (which set a valid accessory). For non-admins we use simple TextDisplayBuilder
    // components. addSafeSection is a final safety net to fallback to text-only if
    // a SectionBuilder unexpectedly fails validation.
    try {
      // Sanitize undefined accessory/thumbnail fields that cause validation to throw
      try {
        if (Object.prototype.hasOwnProperty.call(builder, 'accessory') && builder.accessory === undefined) {
          delete builder.accessory;
        }
        if (Object.prototype.hasOwnProperty.call(builder, 'thumbnail') && builder.thumbnail === undefined) {
          delete builder.thumbnail;
        }
      } catch (sanitizeErr) {
        // ignore sanitize errors, continue to validation
      }
      // Validate section builder
      // eslint-disable-next-line no-unused-expressions
      builder.toJSON();
      container.addSectionComponents(builder);
    } catch (sectionErr) {
      try {
        console.warn('[guildSettings] Section validation failed; using fallback text-only section', { fallbackText, err: sectionErr?.message || sectionErr, stack: sectionErr?.stack });
        // Attempt to log detailed toJSON if available
        try {
          const partial = JSON.stringify(builder, Object.getOwnPropertyNames(builder));
          console.warn('[guildSettings] Section builder properties:', partial);
        } catch (e) { /* ignore stringification errors */ }
      } catch (logErr) {
        console.warn('[guildSettings] Section validation and logging failed:', logErr?.message || logErr);
      }
  // Fallback to a simple text-only display to avoid SectionBuilder accessory validation issues
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fallbackText));
    }
  }

  // Section with optional inline accessory (Button) for horizontal layout (admin only)
  if (isAdmin) {
    const section1 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`📍 **募集チャンネル**\n${recruitChannelValue}`));
    const btn = new ButtonBuilder().setCustomId('set_recruit_channel').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    try {
      section1.setButtonAccessory(btn);
    } catch (e) {
      console.warn('[guildSettings] Section accessory set failed, falling back to action row for recruit channel:', e?.message || e);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
    }
    try { console.log('[guildSettings] section1.toJSON:', section1.toJSON()); } catch (e) { console.error('[guildSettings] section1.toJSON threw:', e); }
    addSafeSection(container, section1, '募集チャンネル: ' + recruitChannelValue);
  } else {
    // Non-admins get a text-only display; avoid SectionBuilder accessory validation
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`📍 **募集チャンネル**\n${recruitChannelValue}`));
  }

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

  if (isAdmin) {
    const section2 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔔 **通知ロール**\n${notificationRoleValue}`));
    const btn = new ButtonBuilder().setCustomId('set_notification_role').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    try {
      section2.setButtonAccessory(btn);
    } catch (e) {
      console.warn('[guildSettings] Section accessory set failed, falling back to action row for notification role:', e?.message || e);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
    }
    try { console.log('[guildSettings] section2.toJSON:', section2.toJSON()); } catch (e) { console.error('[guildSettings] section2.toJSON threw:', e); }
    addSafeSection(container, section2, '通知ロール: ' + notificationRoleValue);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔔 **通知ロール**\n${notificationRoleValue}`));
  }

  const defaultTitleValue = settings.defaultTitle || settings.defaultRecruitTitle || '未設定';
  if (isAdmin) {
    const section3 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`📝 **既定タイトル**\n${defaultTitleValue}`));
    const btn = new ButtonBuilder().setCustomId('set_default_title').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    try {
      section3.setButtonAccessory(btn);
    } catch (e) {
      console.warn('[guildSettings] Section accessory set failed, falling back to action row for default title:', e?.message || e);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
    }
    try { console.log('[guildSettings] section3.toJSON:', section3.toJSON()); } catch (e) { console.error('[guildSettings] section3.toJSON threw:', e); }
    addSafeSection(container, section3, '既定タイトル: ' + defaultTitleValue);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`📝 **既定タイトル**\n${defaultTitleValue}`));
  }

  const defaultColorValue = settings.defaultColor || settings.defaultRecruitColor || '未設定';
  if (isAdmin) {
    const section4 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎨 **既定カラー**\n${defaultColorValue}`));
    const btn = new ButtonBuilder().setCustomId('set_default_color').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    try {
      section4.setButtonAccessory(btn);
    } catch (e) {
      console.warn('[guildSettings] Section accessory set failed, falling back to action row for default color:', e?.message || e);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
    }
    try { console.log('[guildSettings] section4.toJSON:', section4.toJSON()); } catch (e) { console.error('[guildSettings] section4.toJSON threw:', e); }
    addSafeSection(container, section4, '既定カラー: ' + defaultColorValue);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎨 **既定カラー**\n${defaultColorValue}`));
  }

  // 📢 アップデート通知チャンネル（復元）
  const updateChannelValue = settings.update_channel || settings.updateNotificationChannelId 
    ? `<#${settings.update_channel || settings.updateNotificationChannelId}>` 
    : '未設定';

  if (isAdmin) {
    const section5 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`📢 **アップデート通知チャンネル**\n${updateChannelValue}`));
    const btn = new ButtonBuilder().setCustomId('set_update_channel').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    try {
      section5.setButtonAccessory(btn);
    } catch (e) {
      console.warn('[guildSettings] Section accessory set failed, falling back to action row for update channel:', e?.message || e);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
    }
    addSafeSection(container, section5, 'アップデート通知チャンネル: ' + updateChannelValue);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`📢 **アップデート通知チャンネル**\n${updateChannelValue}`));
  }

  // 募集スタイル（画像/シンプル）
  const styleValue = (settings?.recruit_style === 'simple') ? 'シンプル' : '画像パネル';
  if (isAdmin) {
    const sectionStyle = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🖼️ **募集スタイル**\n${styleValue}`));
    const toggleBtn = new ButtonBuilder().setCustomId('toggle_recruit_style').setLabel('スタイル切替').setStyle(ButtonStyle.Primary);
    try {
      sectionStyle.setButtonAccessory(toggleBtn);
    } catch (e) {
      console.warn('[guildSettings] Section accessory set failed, falling back to action row for recruit style:', e?.message || e);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(toggleBtn));
    }
    addSafeSection(container, sectionStyle, '募集スタイル: ' + styleValue);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🖼️ **募集スタイル**\n${styleValue}`));
  }

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  if (isAdmin) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('finalize_settings').setLabel('設定完了').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('reset_all_settings').setLabel('すべてリセット').setStyle(ButtonStyle.Danger).setEmoji('🔄')
      )
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('🔒 **管理者権限が必要です**\n設定変更を行うには管理者権限が必要です。')
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
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

async function showChannelSelect(interaction, settingType, placeholder) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`channel_select_${settingType}`)
    .setPlaceholder(placeholder)
    .addChannelTypes(ChannelType.GuildText);
  const actionRow = new ActionRowBuilder().addComponents(channelSelect);
  await safeRespond(interaction, { content: placeholder, components: [actionRow], flags: MessageFlags.Ephemeral });
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
