const {
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, MessageFlags, ComponentType,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const { getGuildSettingsFromRedis, listTemplates } = require('../../utils/database');
const { safeRespond } = require('../../utils/interactionHandler');

// 設定カテゴリ定義
const SETTING_CATEGORIES = [
  { label: '📍 チャンネル設定', value: 'channels', description: '募集チャンネルと通知チャンネル' },
  { label: '🔔 通知設定', value: 'notifications', description: '通知対象ロールの選択' },
  { label: '🎨 表示設定', value: 'display', description: 'タイトル、カラー、スタイル' },
  { label: '📂 機能設定', value: 'features', description: '専用チャンネルボタン' },
  { label: '📄 募集テンプレート', value: 'templates', description: 'テンプレートの作成・管理' },
];

// 通知ロール配列を取得（共通関数）
function extractNotificationRoles(settings) {
  const roles = [];
  if (Array.isArray(settings.notification_roles)) {
    roles.push(...settings.notification_roles.filter(Boolean));
  }
  if (roles.length === 0 && settings.notification_role) {
    roles.push(settings.notification_role);
  }
  if (roles.length === 0 && settings.recruitmentNotificationRoleId) {
    roles.push(settings.recruitmentNotificationRoleId);
  }
  return [...new Set(roles.map(String))];
}

// 募集チャンネルの表示文字列を取得（共通関数）
function formatRecruitChannelDisplay(settings, maxDisplay = 3) {
  const recruitChannels = Array.isArray(settings.recruit_channels)
    ? settings.recruit_channels.filter(Boolean).map(String)
    : [];
  
  if (recruitChannels.length > 0) {
    const displayChannels = recruitChannels.slice(0, maxDisplay).map(id => `<#${id}>`).join(', ');
    const overflow = recruitChannels.length > maxDisplay ? ` +${recruitChannels.length - maxDisplay}` : '';
    return displayChannels + overflow;
  }
  
  if (settings.recruit_channel || settings.recruitmentChannelId) {
    return `<#${settings.recruit_channel || settings.recruitmentChannelId}>`;
  }
  
  return '未設定';
}

// 募集チャンネルの要約を取得
function getRecruitChannelSummary(settings) {
  return formatRecruitChannelDisplay(settings, 2);
}

// 通知ロールの要約を取得
function getNotificationRolesSummary(settings) {
  return extractNotificationRoles(settings);
}

// 設定サマリーテキストを構築
function buildSettingsSummaryText(settings) {
  const recruitChannelValue = getRecruitChannelSummary(settings);
  const notificationRoles = getNotificationRolesSummary(settings);
  const defaultTitleValue = settings.defaultTitle || settings.defaultRecruitTitle || '参加者募集';
  const styleValue = (settings?.recruit_style === 'simple') ? 'シンプル' : '画像パネル';
  const dedicatedStatus = settings.enable_dedicated_channel ? '✅ 有効' : '⭕ 無効';
  const dedicatedType = getDedicatedChannelTypeLabel(settings?.dedicated_channel_type);

  return `**現在の設定サマリー**\n` +
    `📍 募集チャンネル: ${recruitChannelValue}\n` +
    `🔔 通知ロール: ${notificationRoles.length > 0 ? `${notificationRoles.slice(0, 2).length}個設定済み` : '未設定'}\n` +
    `📝 既定タイトル: ${defaultTitleValue}\n` +
    `🖼️ 募集スタイル: ${styleValue}\n` +
    `📂 専用チャンネル: ${dedicatedStatus} (${dedicatedType})`;
}

// 管理者ボタンを追加
function addAdminButtons(container, isAdmin) {
  if (!isAdmin) return;

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('finalize_settings')
        .setLabel('保存')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('reset_all_settings')
        .setLabel('リセット')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔄')
    )
  );
}

// 設定UI検証と送信
// UI検証と送信の共通関数
async function validateAndSendUI(interaction, container, errorMessage = '⚠️ 設定の表示に失敗しました。') {
  const replyOptions = {
    content: '　',
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  };

  try {
    container.toJSON();
  } catch (validateErr) {
    console.error('[guildSettings] Container validation failed', validateErr);
    await safeRespond(interaction, { 
      content: errorMessage, 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }

  await safeRespond(interaction, replyOptions);

  setTimeout(async () => {
    try { 
      await interaction.deleteReply(); 
    } catch (error) {
      console.warn('[guildSettings] メッセージの自動削除に失敗（既に削除済みの可能性）:', error.message);
    }
  }, 5 * 60 * 1000);
}

// 設定UI表示のメイン関数
async function showSettingsUI(interaction, settings = {}, isAdmin = false) {
  const container = new ContainerBuilder();
  container.setAccentColor(0x5865F2);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ⚙️ ギルド募集設定${isAdmin ? '' : ' (閲覧モード)'}`)
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('settings_category_menu')
    .setPlaceholder('設定項目を選択してください...')
    .addOptions(
      SETTING_CATEGORIES.map(cat => 
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

  const summaryText = buildSettingsSummaryText(settings);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(summaryText));

  addAdminButtons(container, isAdmin);

  await validateAndSendUI(interaction, container, '⚠️ 設定の表示に失敗しました。管理者にお問い合わせください。');
}

// カテゴリ設定の定義
const CATEGORY_CONFIGS = {
  channels: {
    title: '### 📍 チャンネル設定',
    description: '募集チャンネルと通知チャンネルを設定します',
    buttons: [
      { customId: 'set_recruit_channels', label: '募集チャンネル', style: ButtonStyle.Primary, emoji: '📍' },
      { customId: 'set_update_channel', label: '通知チャンネル', style: ButtonStyle.Primary, emoji: '📢' }
    ]
  },
  notifications: {
    title: '### 🔔 通知設定',
    description: 'ゲーム募集時に通知するロールを選択します。複数選択可能',
    buttons: [
      { customId: 'set_notification_role', label: 'ロール設定', style: ButtonStyle.Primary, emoji: '🔔' }
    ]
  },
  display: {
    title: '### 🎨 表示設定',
    description: '募集メッセージのタイトル、カラー、表示スタイルを設定します',
    buttons: [
      { customId: 'set_default_title', label: 'タイトル設定', style: ButtonStyle.Primary, emoji: '📝' },
      { customId: 'set_default_color', label: 'カラー設定', style: ButtonStyle.Primary, emoji: '🎨' },
      { customId: 'toggle_recruit_style', label: 'スタイル切替', style: ButtonStyle.Secondary, emoji: '🖼️' }
    ]
  },
  features: {
    title: '### 📂 機能設定',
    description: '専用チャンネル作成ボタンの有効化と設定',
    buttons: [
      { customId: 'toggle_dedicated_channel', label: 'オン/オフ', style: ButtonStyle.Primary, emoji: '⚡' },
      { customId: 'set_dedicated_channel_type', label: '種類/作成先設定', style: ButtonStyle.Secondary, emoji: '🧭' }
    ]
  },
  templates: {
    title: '### 📄 募集テンプレート',
    description: 'タイトル・人数・色・通知ロールをテンプレ化して素早く募集を開始',
    buttons: [
      { customId: 'create_template', label: 'テンプレート作成', style: ButtonStyle.Primary, emoji: '📄' }
    ]
  }
};

// 設定値の整形
function formatUpdateChannel(settings) {
  return (settings.update_channel || settings.updateNotificationChannelId) 
    ? `<#${settings.update_channel || settings.updateNotificationChannelId}>` 
    : '未設定';
}

function formatDedicatedChannelSettings(settings) {
  const status = settings.enable_dedicated_channel ? '✅ オン' : '⭕ オフ';
  const type = settings?.dedicated_channel_type || 'voice';
  const typeLabel = getDedicatedChannelTypeLabel(type);
  const target = formatDedicatedTarget(settings, type);
  return { status, typeLabel, target };
}

function getDedicatedChannelTypeLabel(type) {
  if (type === 'text') return 'テキストチャンネル';
  if (type === 'thread') return 'スレッド';
  return 'ボイスチャンネル';
}

function formatDedicatedTarget(settings, type) {
  if (type === 'thread') {
    return settings.dedicated_thread_parent_channel_id
      ? `<#${settings.dedicated_thread_parent_channel_id}>`
      : '未設定';
  }

  return settings.dedicated_channel_category_id
    ? `<#${settings.dedicated_channel_category_id}>`
    : 'サーバートップレベル';
}

function formatSettingValues(settings) {
  const recruitChannelValue = formatRecruitChannelDisplay(settings, 3);
  const updateChannelValue = formatUpdateChannel(settings);
  const notificationRoles = extractNotificationRoles(settings);
  const defaultTitleValue = settings.defaultTitle || settings.defaultRecruitTitle || '参加者募集';
  const defaultColorValue = settings.defaultColor || settings.defaultRecruitColor || '#00FFFF';
  const styleValue = (settings?.recruit_style === 'simple') ? 'シンプル' : '画像パネル';
  const dedicated = formatDedicatedChannelSettings(settings);

  return {
    recruitChannelValue,
    updateChannelValue,
    notificationRoles,
    defaultTitleValue,
    defaultColorValue,
    styleValue,
    dedicatedStatus: dedicated.status,
    dedicatedType: dedicated.typeLabel,
    dedicatedTarget: dedicated.target,
  };
}

// 通知ロールの表示整形
function formatNotificationRolesDisplay(notificationRoles) {
  if (notificationRoles.length === 0) return '未設定';
  
  const displayRoles = notificationRoles
    .slice(0, 5)
    .map(r => r === 'everyone' ? '@everyone' : r === 'here' ? '@here' : `<@&${r}>`);
  
  const overflow = notificationRoles.length > 5 ? ` +${notificationRoles.length - 5}` : '';
  return displayRoles.join(', ') + overflow;
}

// カテゴリ別コンテンツ生成関数
function getChannelsContent(recruitChannelValue, updateChannelValue) {
  return `**現在の設定**\n` +
    `📍 募集チャンネル: ${recruitChannelValue}\n` +
    `📢 通知チャンネル: ${updateChannelValue}`;
}

function getNotificationsContent(notificationRoles) {
  const rolesDisplay = formatNotificationRolesDisplay(notificationRoles);
  return `**現在の設定**\n🔔 通知ロール: ${rolesDisplay}`;
}

function getDisplayContent(defaultTitleValue, defaultColorValue, styleValue) {
  return `**現在の設定**\n` +
    `📝 既定タイトル: ${defaultTitleValue}\n` +
    `🎨 既定カラー: ${defaultColorValue}\n` +
    `🖼️ 募集スタイル: ${styleValue}`;
}

function getFeaturesContent(dedicatedStatus, dedicatedType, dedicatedTarget) {
  return `**現在の設定**\n` +
    `📂 専用チャンネル: ${dedicatedStatus}\n` +
    `🧭 種類: ${dedicatedType}\n` +
    `📁 作成先: ${dedicatedTarget}`;
}

async function getTemplatesContentWithSettings(guildId, settings) {
  try {
    const creationPermission = settings?.allow_member_template_create
      ? '✅ 一般ユーザー作成: 許可'
      : '🔒 一般ユーザー作成: 禁止';

    const templates = await listTemplates(guildId);
    if (templates && templates.length > 0) {
      const templateList = templates.slice(0, 5)
        .map((t, i) => `${i + 1}. **${t.name}** (${t.title}) - ${t.participants}人 - <@&${t.notification_role_id}>`)
        .join('\n');
      return `**現在の設定**\n${creationPermission}\n\n**保存済みテンプレート**\n${templateList}`;
    }
    return `**現在の設定**\n${creationPermission}\n\n**保存済みテンプレート**\nテンプレートがありません`;
  } catch (err) {
    console.error('[guildSettings] Template list load error:', err);
    return '**保存済みテンプレート**\nテンプレートを読み込めませんでした。';
  }
}

// カテゴリ別のコンテンツを取得
async function getCategoryContent(category, values, interaction, settings) {
  const {
    recruitChannelValue,
    updateChannelValue,
    notificationRoles,
    defaultTitleValue,
    defaultColorValue,
    styleValue,
    dedicatedStatus,
    dedicatedType,
    dedicatedTarget,
  } = values;

  switch (category) {
    case 'channels':
      return getChannelsContent(recruitChannelValue, updateChannelValue);
    case 'notifications':
      return getNotificationsContent(notificationRoles);
    case 'display':
      return getDisplayContent(defaultTitleValue, defaultColorValue, styleValue);
    case 'features':
      return getFeaturesContent(dedicatedStatus, dedicatedType, dedicatedTarget);
    case 'templates':
      return await getTemplatesContentWithSettings(interaction.guildId, settings);
    default:
      return '';
  }
}

function getTemplateButtons(settings, isAdmin) {
  const buttons = [];
  const allowMemberTemplateCreate = !!settings?.allow_member_template_create;

  if (isAdmin || allowMemberTemplateCreate) {
    buttons.push({ customId: 'create_template', label: 'テンプレート作成', style: ButtonStyle.Primary, emoji: '📄' });
  }

  if (isAdmin) {
    buttons.push({
      customId: 'toggle_template_creation_permission',
      label: `一般ユーザー作成: ${allowMemberTemplateCreate ? '許可中' : '禁止中'}`,
      style: allowMemberTemplateCreate ? ButtonStyle.Success : ButtonStyle.Secondary,
      emoji: allowMemberTemplateCreate ? '✅' : '🔒'
    });
  }

  return buttons;
}

// ボタン行を構築
function buildButtonRows(buttons) {
  const buttonRows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = new ActionRowBuilder();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(buttons[i].customId)
        .setLabel(buttons[i].label)
        .setStyle(buttons[i].style)
        .setEmoji(buttons[i].emoji)
    );
    if (buttons[i + 1]) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(buttons[i + 1].customId)
          .setLabel(buttons[i + 1].label)
          .setStyle(buttons[i + 1].style)
          .setEmoji(buttons[i + 1].emoji)
      );
    }
    buttonRows.push(row);
  }
  return buttonRows;
}

// カテゴリUIにボタンを追加
function addCategoryButtons(container, config, isAdmin, category, settings) {
  const buttons = category === 'templates'
    ? getTemplateButtons(settings, isAdmin)
    : config.buttons;
  const canUseButtons = isAdmin || (category === 'templates' && !!settings?.allow_member_template_create);

  if (canUseButtons && buttons.length > 0) {
    console.log(`[guildSettings] Adding ${buttons.length} buttons for category: ${category}`);
    const buttonRows = buildButtonRows(buttons);
    buttonRows.forEach(row => container.addActionRowComponents(row));
  } else if (!isAdmin) {
    console.log('[guildSettings] User is not admin, hiding buttons');
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        category === 'templates'
          ? '🔒 **このサーバーでは一般ユーザーのテンプレート作成が許可されていません**'
          : '🔒 **変更には管理者権限が必要です**'
      )
    );
  } else {
    console.log(`[guildSettings] No buttons configured for category: ${category}`);
  }
}

// UIの検証と送信
// カテゴリUI表示のメイン関数
async function showSettingsCategoryUI(interaction, category, settings = {}, isAdmin = false) {
  const config = CATEGORY_CONFIGS[category];
  if (!config) {
    await safeRespond(interaction, { content: '❌ 不明なカテゴリです', flags: MessageFlags.Ephemeral });
    return;
  }

  const container = new ContainerBuilder();
  container.setAccentColor(0x5865F2);

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

  const values = formatSettingValues(settings);
  const content = await getCategoryContent(category, values, interaction, settings);
  
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  addCategoryButtons(container, config, isAdmin, category, settings);

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('powered by **Recrubo**')
  );

  await validateAndSendUI(interaction, container);
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

async function showDedicatedChannelTypeSelect(interaction) {
  const currentSettings = await getGuildSettingsFromRedis(interaction.guildId).catch(() => ({}));
  const currentType = currentSettings?.dedicated_channel_type || 'voice';

  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId('dedicated_channel_type_select')
    .setPlaceholder('専用チャンネルの種類を選択してください')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('ボイスチャンネル')
        .setValue('voice')
        .setDescription('募集ごとにボイスチャンネルを作成します')
        .setDefault(currentType === 'voice'),
      new StringSelectMenuOptionBuilder()
        .setLabel('テキストチャンネル')
        .setValue('text')
        .setDescription('募集ごとにテキストチャンネルを作成します')
        .setDefault(currentType === 'text'),
      new StringSelectMenuOptionBuilder()
        .setLabel('スレッド')
        .setValue('thread')
        .setDescription('指定チャンネル配下に募集ごとのスレッドを作成します')
        .setDefault(currentType === 'thread')
    );

  const actionRow = new ActionRowBuilder().addComponents(typeSelect);
  await safeRespond(interaction, {
    content: '🧭 専用チャンネルの種類を選択してください。選択後に作成先を指定します。',
    components: [actionRow],
    flags: MessageFlags.Ephemeral
  });
}

// 現在選択されているロールを取得
function getSelectedRoles(settings) {
  return extractNotificationRoles(settings);
}

// everyone/hereと実際のロールを分離
function separateSpecialRoles(selectedRoles) {
  return {
    hasEveryone: selectedRoles.includes('everyone'),
    hasHere: selectedRoles.includes('here'),
    actualRoles: selectedRoles.filter(r => r !== 'everyone' && r !== 'here')
  };
}

// ロール選択メニューを作成
function createRoleSelectMenu(settingType, actualRoles) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`role_select_${settingType}`)
    .setPlaceholder('通知するロールを選択（複数可）')
    .setMinValues(0)
    .setMaxValues(25);

  if (actualRoles.length > 0 && typeof roleSelect.setDefaultRoles === 'function') {
    roleSelect.setDefaultRoles(...actualRoles);
  }

  return roleSelect;
}

// 特別なロール用トグルボタンを作成
function createSpecialRoleButtons(hasEveryone, hasHere) {
  return new ActionRowBuilder().addComponents(
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
}

// ロール選択UI表示
async function showRoleSelect(interaction, settingType, placeholder) {
  const currentSettings = await getGuildSettingsFromRedis(interaction.guildId);
  const selectedRoles = getSelectedRoles(currentSettings);
  const { hasEveryone, hasHere, actualRoles } = separateSpecialRoles(selectedRoles);

  const roleSelect = createRoleSelectMenu(settingType, actualRoles);
  const specialButtonRow = createSpecialRoleButtons(hasEveryone, hasHere);
  
  const actionRows = [
    new ActionRowBuilder().addComponents(roleSelect),
    specialButtonRow
  ];

  try {
    await safeRespond(interaction, { 
      content: `${placeholder}\n\n💡 **ヒント**: @everyone/@hereは下のボタンで切り替えできます`, 
      components: actionRows, 
      flags: MessageFlags.Ephemeral 
    });
  } catch (error) {
    console.error('[guildSettings] showRoleSelect response error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeRespond(interaction, { 
        content: '❌ ロール選択メニューの表示に失敗しました。時間を置いて再度お試しください。', 
        flags: MessageFlags.Ephemeral 
      });
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
  const modal = new ModalBuilder().setCustomId('template_create_modal').setTitle('📄 募集テンプレート作成（ステップ1/3）');

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
    .setLabel('募集人数（必須）1-16の数字')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2)
    .setPlaceholder('例: 4');

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(memberInput)
  );

  try {
    await interaction.showModal(modal);
  } catch (showErr) {
    console.error('[guildSettings] showTemplateModal error:', showErr);
    throw showErr;
  }
}

// テンプレート入力フィールドの定義
const TEMPLATE_OPTIONAL_FIELDS = [
  {
    customId: 'template_content',
    label: '募集内容（任意）',
    style: TextInputStyle.Paragraph,
    maxLength: 200,
    placeholder: '例: エンジョイ勢向け、レート不問、楽しくプレイしましょう'
  },
  {
    customId: 'template_start_time',
    label: '開始時間（任意）',
    style: TextInputStyle.Short,
    maxLength: 100,
    placeholder: '例: 今から / 20:00 / 2時間後'
  },
  {
    customId: 'template_regulation',
    label: '規定人数（任意）1-99の数字',
    style: TextInputStyle.Short,
    maxLength: 2,
    placeholder: '例: 4 （最少必要人数）'
  },
  {
    customId: 'template_voice_place',
    label: '通話場所（任意）',
    style: TextInputStyle.Short,
    maxLength: 100,
    placeholder: '例: Discord / VC1 / アプリ内通話'
  },
  {
    customId: 'template_voice_option',
    label: '通話有無（任意）',
    style: TextInputStyle.Short,
    maxLength: 50,
    placeholder: '例: あり / なし / 推奨'
  }
];

// テンプレート入力フィールドを作成
function createTemplateInputField(config) {
  return new TextInputBuilder()
    .setCustomId(config.customId)
    .setLabel(config.label)
    .setStyle(config.style)
    .setRequired(false)
    .setMaxLength(config.maxLength)
    .setPlaceholder(config.placeholder);
}

// テンプレート詳細設定モーダル
async function showTemplateOptionalModal(interaction, templateData) {
  const modal = new ModalBuilder()
    .setCustomId('template_optional_modal')
    .setTitle('📄 テンプレート詳細設定（ステップ3/3、任意）');

  TEMPLATE_OPTIONAL_FIELDS.forEach(fieldConfig => {
    const input = createTemplateInputField(fieldConfig);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  modal.data = templateData || {};

  try {
    await interaction.showModal(modal);
  } catch (showErr) {
    console.error('[guildSettings] showTemplateOptionalModal error:', showErr);
    throw showErr;
  }
}

const RECRUIT_COLOR_CHOICES = [
  { name: '赤', value: 'FF0000' },
  { name: 'オレンジ', value: 'FF8000' },
  { name: '黄', value: 'FFFF00' },
  { name: '緑', value: '00FF00' },
  { name: '水色', value: '00FFFF' },
  { name: '青', value: '0000FF' },
  { name: '紫', value: '8000FF' },
  { name: 'ピンク', value: 'FF69B4' },
  { name: '茶', value: '8B4513' },
  { name: '白', value: 'FFFFFF' },
  { name: '黒', value: '000000' },
  { name: 'グレー', value: '808080' },
];

async function showTemplateColorSelect(interaction) {
  const options = RECRUIT_COLOR_CHOICES.map(c =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${c.name} (#${c.value})`)
      .setValue(c.value)
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`template_color_select_${interaction.id}`)
    .setPlaceholder('募集カラーを選択してください')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  const prompt = await interaction.followUp({
    content: '🎨 **ステップ2/3：募集カラーを選択してください**\n/rect と同じプリセット色から選べます。',
    components: [selectRow],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { roles: [], users: [] }
  });

  if (!prompt || typeof prompt.awaitMessageComponent !== 'function') {
    return null;
  }

  try {
    const selectInteraction = await prompt.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id
    });
    return selectInteraction.values[0];
  } catch (err) {
    console.error('[guildSettings] template color select timeout:', err?.message || err);
    return null;
  }
}

// 設定されているロールIDを取得
function getConfiguredRoleIds(settings) {
  const roles = extractNotificationRoles(settings);
  // 通知ロールからeveryoneとhereを除く（実際のロールIDのみ）
  return roles.filter(r => r !== 'everyone' && r !== 'here');
}

// ロールIDを検証して有効なロール情報を取得
async function validateSingleRole(roleId, guild) {
  if (roleId === 'everyone') {
    return { id: roleId, name: '@everyone' };
  }
  if (roleId === 'here') {
    return { id: roleId, name: '@here' };
  }
  
  const role = guild?.roles?.cache?.get(roleId) || 
    (await guild.roles.fetch(roleId).catch(() => null));
  
  return role ? { id: role.id, name: role.name } : null;
}

async function validateRoles(roleIds, guild) {
  const validRoles = [];
  for (const roleId of roleIds) {
    const validRole = await validateSingleRole(roleId, guild);
    if (validRole) {
      validRoles.push(validRole);
    }
  }
  return validRoles;
}

// ロール選択メニューを作成して待機
async function createAndAwaitRoleSelect(validRoles, interaction) {
  const options = validRoles.slice(0, 24).map(role =>
    new StringSelectMenuOptionBuilder()
      .setLabel(role.name?.slice(0, 100) || '通知ロール')
      .setValue(role.id)
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`template_notification_role_select_${interaction.id}`)
    .setPlaceholder('通知ロールを選択してください')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  const promptMessage = await interaction.followUp({
    content: '🔔 **ステップ3/3：通知ロールを選択してください**\n\nギルド設定で許可されているロールから選択できます。',
    components: [selectRow],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { roles: [], users: [] }
  });

  if (!promptMessage || typeof promptMessage.awaitMessageComponent !== 'function') {
    return validRoles[0]?.id || null;
  }

  const selectInteraction = await promptMessage.awaitMessageComponent({
    componentType: ComponentType.StringSelect,
    time: 60_000,
    filter: (i) => i.user.id === interaction.user.id
  });

  return selectInteraction.values[0];
}

// テンプレート用の通知ロール選択
async function showTemplateNotificationRoleSelect(interaction, _templateData) {
  const settings = await getGuildSettingsFromRedis(interaction.guildId);
  const roleIds = getConfiguredRoleIds(settings);
  const validRoles = await validateRoles(roleIds, interaction.guild);

  if (validRoles.length === 0) {
    await interaction.followUp({ 
      content: '❌ ギルド設定で通知ロールが設定されていません。先に設定を行ってください。', 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
    return null;
  }

  // 1つだけの場合は自動選択
  if (validRoles.length === 1) {
    return validRoles[0].id;
  }

  // 複数ある場合はセレクトメニューで選択
  try {
    return await createAndAwaitRoleSelect(validRoles, interaction);
  } catch (err) {
    console.error('[guildSettings] showTemplateNotificationRoleSelect timeout:', err?.message || err);
    return null;
  }
}

module.exports = {
  showSettingsUI,
  showSettingsCategoryUI,
  showChannelSelect,
  showRoleSelect,
  showTitleModal,
  showColorModal,
  showDedicatedChannelTypeSelect,
  showTemplateModal,
  showTemplateOptionalModal,
  showTemplateColorSelect,
  showTemplateNotificationRoleSelect,
};
