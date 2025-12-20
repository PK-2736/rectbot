const {
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SectionBuilder
} = require('discord.js');

const { getGuildSettingsFromRedis, listTemplates } = require('../../utils/db');
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

  // quiet
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ⚙️ ギルド募集設定${isAdmin ? '' : ' (閲覧モード)'}`)
  );

  // StringSelectMenuで設定項目を選択
  const settingCategories = [
    { label: '📍 チャンネル設定', value: 'channels', description: '募集チャンネルと通知チャンネル' },
    { label: '🔔 通知設定', value: 'notifications', description: '通知対象ロールの選択' },
    { label: '🎨 表示設定', value: 'display', description: 'タイトル、カラー、スタイル' },
    { label: '📂 機能設定', value: 'features', description: '専用チャンネルボタン、スタイル' },
    { label: '📄 募集テンプレート', value: 'templates', description: 'テンプレートの作成・管理' },
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('settings_category_menu')
    .setPlaceholder('設定項目を選択してください...')
    .addOptions(
      settingCategories.map(cat => 
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.label)
          .setValue(cat.value)
          .setDescription(cat.description)
      )
    );

  container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // デフォルト表示: 簡易サマリー
  const recruitChannels = Array.isArray(settings.recruit_channels)
    ? settings.recruit_channels.filter(Boolean).map(String)
    : [];
  const recruitChannelValue = (() => {
    if (recruitChannels.length > 0) return recruitChannels.slice(0, 2).map(id => `<#${id}>`).join(', ') + (recruitChannels.length > 2 ? ` +${recruitChannels.length - 2}` : '');
    if (settings.recruit_channel || settings.recruitmentChannelId) return `<#${settings.recruit_channel || settings.recruitmentChannelId}>`;
    return '未設定';
  })();

  const notificationRoles = (() => {
    const roles = [];
    if (Array.isArray(settings.notification_roles)) roles.push(...settings.notification_roles.filter(Boolean));
    if (roles.length === 0 && settings.notification_role) roles.push(settings.notification_role);
    if (roles.length === 0 && settings.recruitmentNotificationRoleId) roles.push(settings.recruitmentNotificationRoleId);
    return [...new Set(roles.map(String))];
  })();

  const updateChannelValue = (settings.update_channel || settings.updateNotificationChannelId) 
    ? `<#${settings.update_channel || settings.updateNotificationChannelId}>` 
    : '未設定';

  const defaultTitleValue = settings.defaultTitle || settings.defaultRecruitTitle || '参加者募集';
  const styleValue = (settings?.recruit_style === 'simple') ? 'シンプル' : '画像パネル';
  const dedicatedStatus = !!settings.enable_dedicated_channel ? '✅ 有効' : '⭕ 無効';

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**現在の設定サマリー**\n` +
      `📍 募集チャンネル: ${recruitChannelValue}\n` +
      `🔔 通知ロール: ${notificationRoles.length > 0 ? `${notificationRoles.slice(0, 2).length}個設定済み` : '未設定'}\n` +
      `📝 既定タイトル: ${defaultTitleValue}\n` +
      `🖼️ 募集スタイル: ${styleValue}\n` +
      `📂 専用チャンネル: ${dedicatedStatus}`
    )
  );

  // ホーム画面でのみ保存／リセットボタンを表示
  if (isAdmin) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('finalize_settings').setLabel('保存').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('reset_all_settings').setLabel('リセット').setStyle(ButtonStyle.Danger).setEmoji('🔄')
      )
    );
  }

  const replyOptions = {
    content: '　',
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  };

  // Validate the container
  try {
    container.toJSON();
  } catch (validateErr) {
    console.error('[guildSettings] Container validation failed, falling back to plain text reply', validateErr);
    await safeRespond(interaction, { content: '⚠️ 設定の表示に失敗しました。管理者にお問い合わせください。', flags: MessageFlags.Ephemeral });
    return;
  }

  await safeRespond(interaction, replyOptions);

  setTimeout(async () => {
    try { await interaction.deleteReply(); } catch (error) {
      console.warn('[guildSettings] メッセージの自動削除に失敗（既に削除済みの可能性）:', error.message);
    }
  }, 5 * 60 * 1000);
}

async function showSettingsCategoryUI(interaction, category, settings = {}, isAdmin = false) {
  const container = new ContainerBuilder();
  container.setAccentColor(0x5865F2);

  const categoryConfigs = {
    channels: {
      title: '📍 チャンネル設定',
      description: '募集チャンネルと通知チャンネルを設定します',
      buttons: [
        { customId: 'set_recruit_channels', label: '募集チャンネル', style: ButtonStyle.Primary, emoji: '📍' },
        { customId: 'set_update_channel', label: '通知チャンネル', style: ButtonStyle.Primary, emoji: '📢' }
      ]
    },
    notifications: {
      title: '🔔 通知設定',
      description: 'ゲーム募集時に通知するロールを選択します。複数選択可能',
      buttons: [
        { customId: 'set_notification_role', label: 'ロール設定', style: ButtonStyle.Primary, emoji: '🔔' }
      ]
    },
    display: {
      title: '🎨 表示設定',
      description: '募集メッセージのタイトル、カラー、表示スタイルを設定します',
      buttons: [
        { customId: 'set_default_title', label: 'タイトル設定', style: ButtonStyle.Primary, emoji: '📝' },
        { customId: 'set_default_color', label: 'カラー設定', style: ButtonStyle.Primary, emoji: '🎨' },
        { customId: 'toggle_recruit_style', label: 'スタイル切替', style: ButtonStyle.Secondary, emoji: '🖼️' }
      ]
    },
    features: {
      title: '📂 機能設定',
      description: '専用チャンネル作成ボタンの有効化と設定',
      buttons: [
        { customId: 'toggle_dedicated_channel', label: 'オン/オフ', style: ButtonStyle.Primary, emoji: '⚡' },
        { customId: 'set_dedicated_category', label: 'カテゴリ指定', style: ButtonStyle.Secondary, emoji: '📁' }
      ]
    },
    templates: {
      title: '📄 募集テンプレート',
      description: 'タイトル・人数・色・通知ロールをテンプレ化して素早く募集を開始',
      buttons: [
        { customId: 'create_template', label: 'テンプレート作成', style: ButtonStyle.Primary, emoji: '🆕' }
      ]
    }
  };

  const config = categoryConfigs[category];
  if (!config) {
    await safeRespond(interaction, { content: '❌ 不明なカテゴリです', flags: MessageFlags.Ephemeral });
    return;
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${config.title}`)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**説明**\n${config.description}`)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // カテゴリごとの詳細情報を表示
  const recruitChannels = Array.isArray(settings.recruit_channels)
    ? settings.recruit_channels.filter(Boolean).map(String)
    : [];
  const recruitChannelValue = (() => {
    if (recruitChannels.length > 0) return recruitChannels.slice(0, 3).map(id => `<#${id}>`).join(', ') + (recruitChannels.length > 3 ? ` +${recruitChannels.length - 3}` : '');
    if (settings.recruit_channel || settings.recruitmentChannelId) return `<#${settings.recruit_channel || settings.recruitmentChannelId}>`;
    return '未設定';
  })();

  const updateChannelValue = (settings.update_channel || settings.updateNotificationChannelId) 
    ? `<#${settings.update_channel || settings.updateNotificationChannelId}>` 
    : '未設定';

  const notificationRoles = (() => {
    const roles = [];
    if (Array.isArray(settings.notification_roles)) roles.push(...settings.notification_roles.filter(Boolean));
    if (roles.length === 0 && settings.notification_role) roles.push(settings.notification_role);
    return [...new Set(roles.map(String))];
  })();

  const defaultTitleValue = settings.defaultTitle || settings.defaultRecruitTitle || '参加者募集';
  const defaultColorValue = settings.defaultColor || settings.defaultRecruitColor || '#00FFFF';
  const styleValue = (settings?.recruit_style === 'simple') ? 'シンプル' : '画像パネル';
  const dedicatedStatus = !!settings.enable_dedicated_channel ? '✅ オン' : '⭕ オフ';
  const dedicatedCategory = settings.dedicated_channel_category_id
    ? `<#${settings.dedicated_channel_category_id}>`
    : 'サーバートップレベル';

  if (category === 'channels') {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**現在の設定**\n` +
        `📍 募集チャンネル: ${recruitChannelValue}\n` +
        `📢 通知チャンネル: ${updateChannelValue}`
      )
    );
  } else if (category === 'notifications') {
    const rolesDisplay = notificationRoles.length > 0
      ? notificationRoles.slice(0, 5).map(r => r === 'everyone' ? '@everyone' : r === 'here' ? '@here' : `<@&${r}>`).join(', ') + (notificationRoles.length > 5 ? ` +${notificationRoles.length - 5}` : '')
      : '未設定';
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**現在の設定**\n🔔 通知ロール: ${rolesDisplay}`)
    );
  } else if (category === 'display') {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**現在の設定**\n` +
        `📝 既定タイトル: ${defaultTitleValue}\n` +
        `🎨 既定カラー: ${defaultColorValue}\n` +
        `🖼️ 募集スタイル: ${styleValue}`
      )
    );
  } else if (category === 'features') {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**現在の設定**\n` +
        `📂 専用チャンネル: ${dedicatedStatus}\n` +
        `📁 作成先カテゴリ: ${dedicatedCategory}`
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // ボタンを配置
  if (isAdmin && config.buttons.length > 0) {
    const buttonRows = [];
    for (let i = 0; i < config.buttons.length; i += 2) {
      const row = new ActionRowBuilder();
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(config.buttons[i].customId)
          .setLabel(config.buttons[i].label)
          .setStyle(config.buttons[i].style)
          .setEmoji(config.buttons[i].emoji)
      );
      if (config.buttons[i + 1]) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(config.buttons[i + 1].customId)
            .setLabel(config.buttons[i + 1].label)
            .setStyle(config.buttons[i + 1].style)
            .setEmoji(config.buttons[i + 1].emoji)
        );
      }
      buttonRows.push(row);
    }
    buttonRows.forEach(row => container.addActionRowComponents(row));
  } else if (!isAdmin) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('🔒 **変更には管理者権限が必要です**')
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('powered by **Recrubo**')
  );

  const replyOptions = {
    content: '　',
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  };

  try {
    container.toJSON();
  } catch (validateErr) {
    console.error('[guildSettings] Category UI validation failed', validateErr);
    await safeRespond(interaction, { content: '⚠️ 設定の表示に失敗しました。', flags: MessageFlags.Ephemeral });
    return;
  }

  await safeRespond(interaction, replyOptions);

  setTimeout(async () => {
    try { await interaction.deleteReply(); } catch (error) {
      console.warn('[guildSettings] メッセージの自動削除に失敗', error.message);
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

async function showTemplateModal(interaction) {
  const modal = new ModalBuilder().setCustomId('template_create_modal').setTitle('📄 募集テンプレート作成');

  const nameInput = new TextInputBuilder()
    .setCustomId('template_name')
    .setLabel('テンプレート名（必須）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('例: 深夜ランク用 / カジュアル用');

  const titleInput = new TextInputBuilder()
    .setCustomId('template_title')
    .setLabel('募集タイトル（必須）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(150)
    .setPlaceholder('例: ランクマ固定募集 / 初心者歓迎');

  const memberInput = new TextInputBuilder()
    .setCustomId('template_members')
    .setLabel('募集人数（必須）1-16')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2)
    .setPlaceholder('例: 4');

  const colorInput = new TextInputBuilder()
    .setCustomId('template_color')
    .setLabel('募集色（必須）HEX 6桁 / #なし')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(6)
    .setMaxLength(6)
    .setPlaceholder('例: 5865F2');

  const optionalInput = new TextInputBuilder()
    .setCustomId('template_optional')
    .setLabel('通知ロール（必須）＋任意項目をカンマ区切りで')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(400)
    .setPlaceholder('例: 通知=@レイド, 内容=エンジョイ, 開始=今から, 規定人数=4, 通話場所=VC1, 通話有無=あり');

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(memberInput),
    new ActionRowBuilder().addComponents(colorInput),
    new ActionRowBuilder().addComponents(optionalInput)
  );

  await interaction.showModal(modal);
}

module.exports = {
  showSettingsUI,
  showSettingsCategoryUI,
  showChannelSelect,
  showRoleSelect,
  showTitleModal,
  showColorModal,
  showTemplateModal,
};
