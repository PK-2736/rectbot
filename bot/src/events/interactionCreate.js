// --- interactionCreate event handler ---
// P0修正: 共通エラーハンドラーを使用し、deferReplyを標準化
const { MessageFlags } = require('discord.js');
const { safeRespond, handleCommandSafely, handleComponentSafely } = require('../utils/interactionHandler');
const { scheduleBumpNotification } = require('../utils/emailNotifier');

// ギルド設定コマンド解決ヘルパー
function getGuildSettingsCommand(client) {
  return client.commands.get('setting') || client.commands.get('rect-setting');
}

// デデュープ処理
function handleInteractionDedupe(interaction, client) {
  try {
    const hasSet = client?.processedInteractions?.has?.(interaction.id);
    if (hasSet) return true;
    
    if (client?.processedInteractions?.add) {
      client.processedInteractions.add(interaction.id);
      setTimeout(() => {
        try {
          client.processedInteractions.delete(interaction.id);
        } catch (_e) {}
      }, client.DEDUPE_TTL_MS || 3000);
    }
    return false;
  } catch (e) {
    console.error('[interactionCreate] Error during dedupe check:', e);
    return false;
  }
}

// オートコンプリート処理
async function handleAutocomplete(interaction, client) {
  try {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      await command.autocomplete(interaction);
      return;
    }

    const focused = interaction.options.getFocused(true);
    const name = focused?.name;
    const value = (focused?.value || '').toString();
    const choices = [];
    
    if (name === 'タイトル') {
      try {
        const { getGuildSettings } = require('../utils/db');
        const settings = await getGuildSettings(interaction.guildId).catch(() => null);
        const def = settings?.defaultTitle;
        if (def && (!value || def.includes(value))) {
          choices.push({ name: `既定: ${def}`, value: def });
        }
      } catch (_) {}
    }
    
    if (name === '開始時間') {
      const label = '今から';
      const v = (value || '').toLowerCase();
      const shouldSuggest = !v || ['いま','今','ima','now'].some(k => v.includes(k));
      if (shouldSuggest) {
        choices.push({ name: label, value: label });
      }
    }
    
    await interaction.respond(choices.slice(0, 10));
  } catch (e) {
    console.warn('[interactionCreate] autocomplete error:', e?.message || e);
  }
}

// スラッシュコマンド処理
async function handleSlashCommand(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  
  const deferNeeded = !(command?.noDefer === true);
  await handleCommandSafely(interaction, async (inter) => {
    await command.execute(inter);
  }, { defer: deferNeeded, deferOptions: { ephemeral: true } });
  
  if (interaction.user.id === '302050872383242240') {
    try {
      const channelName = interaction.channel?.name || 'チャンネル';
      const userTag = interaction.user.tag;
      const commandName = interaction.commandName;
      scheduleBumpNotification(userTag, channelName, `実行されたコマンド: /${commandName}`);
    } catch (notificationError) {
      console.error('[interactionCreate] bump通知スケジュールエラー:', notificationError);
    }
  }
}

// 文字列選択メニュー処理
async function handleStringSelectMenu(interaction, client) {
  const id = interaction.customId;
  
  if (id?.startsWith('channel_select_') || id?.startsWith('role_select_') || id === 'settings_category_menu') {
    const guildSettings = getGuildSettingsCommand(client);
    if (guildSettings?.handleSelectMenuInteraction) {
      await handleComponentSafely(interaction, () => guildSettings.handleSelectMenuInteraction(interaction));
    } else {
      await safeRespond(interaction, { content: '設定ハンドラが見つかりませんでした。', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }

  if (id === 'help_command_select') {
    const helpCommand = client.commands.get('help');
    if (helpCommand?.handleSelectMenu) {
      await handleComponentSafely(interaction, () => helpCommand.handleSelectMenu(interaction));
    }
  }
}

// ロール/チャンネル選択メニュー処理
async function handleRoleChannelSelectMenu(interaction, client) {
  const id = interaction.customId;
  
  if (id?.startsWith('channel_select_') || id?.startsWith('role_select_')) {
    const guildSettings = getGuildSettingsCommand(client);
    if (guildSettings?.handleSelectMenuInteraction) {
      try {
        await guildSettings.handleSelectMenuInteraction(interaction);
      } catch (error) {
        console.error('ギルド設定セレクトメニュー処理中にエラー:', error);
        await safeRespond(interaction, { content: 'メニュー処理でエラーが発生しました。', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    } else {
      console.warn('[interactionCreate] guildSettings handler not found for role/channel select. Available commands:', [...client.commands.keys()].join(', '));
      await safeRespond(interaction, { content: '設定ハンドラが見つかりませんでした。', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

// モーダル送信処理 - ギルド設定関連
async function handleGuildSettingsModal(interaction, client) {
  const guildSettings = getGuildSettingsCommand(client);
  if (guildSettings?.handleModalSubmit) {
    try {
      await guildSettings.handleModalSubmit(interaction);
    } catch (error) {
      console.error('ギルド設定モーダル処理中にエラー:', error);
      await safeRespond(interaction, { content: `モーダル処理でエラー: ${error.message || error}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  } else {
    console.warn('[interactionCreate] guildSettings handler not found for modal. Available commands:', [...client.commands.keys()].join(', '));
    await safeRespond(interaction, { content: '設定ハンドラが見つかりませんでした。', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

// モーダル送信処理 - 報告返信
async function handleReportReplyModal(interaction) {
  const authorId = interaction.customId.replace('report_reply_modal_', '');
  const replyContent = interaction.fields.getTextInputValue('reply_content');
  
  try {
    const user = await interaction.client.users.fetch(authorId).catch(() => null);
    if (!user) {
      await safeRespond(interaction, { content: '❌ ユーザーが見つかりませんでした。', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    
    const { EmbedBuilder } = require('discord.js');
    const replyEmbed = new EmbedBuilder()
      .setTitle('📨 Recrubo開発者からの返信')
      .setDescription(replyContent)
      .setColor(0x4C8DFF)
      .setFooter({ text: 'Recrubo Bot' })
      .setTimestamp();
    
    await user.send({ embeds: [replyEmbed] });
    await safeRespond(interaction, { content: '✅ ユーザーにDMを送信しました。', flags: MessageFlags.Ephemeral }).catch(() => {});
    console.log(`[report] 返信をユーザーに送信しました - ユーザーID: ${authorId}`);
  } catch (error) {
    console.error('[report] 返信送信エラー:', error);
    await safeRespond(interaction, { content: `❌ 返信の送信に失敗しました: ${error.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

// モーダル送信処理
async function handleModalSubmit(interaction, client) {
  const id = interaction.customId;
  
  if (id === 'default_title_modal' || id === 'default_color_modal' || id === 'template_create_modal' || id === 'template_optional_modal') {
    await handleGuildSettingsModal(interaction, client);
    return;
  }

  if (id?.startsWith('editRecruitModal_')) {
    const editRecruit = client.commands.get('rect_edit');
    if (editRecruit?.handleModalSubmit) {
      try {
        await editRecruit.handleModalSubmit(interaction);
      } catch (error) {
        console.error('編集モーダル送信処理中にエラー:', error);
        await safeRespond(interaction, { content: `編集モーダル送信処理でエラー: ${error.message || error}`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }

  if (id === 'friend_code_add_modal') {
    const linkAdd = client.commands.get('id_add');
    if (linkAdd?.handleModalSubmit) {
      try {
        await linkAdd.handleModalSubmit(interaction);
      } catch (error) {
        console.error('フレンドコード登録モーダル処理中にエラー:', error);
        await safeRespond(interaction, { content: `フレンドコード登録処理でエラー: ${error.message || error}`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }

  if (id?.startsWith('report_reply_modal_')) {
    await handleReportReplyModal(interaction);
    return;
  }

  if (id?.startsWith('report_modal_')) {
    const report = client.commands.get('report');
    if (report?.handleModalSubmit) {
      try {
        await report.handleModalSubmit(interaction);
      } catch (error) {
        console.error('エラー報告モーダル処理中にエラー:', error);
        await safeRespond(interaction, { content: `エラー報告処理でエラー: ${error.message || error}`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }
  
  const gameRecruit = client.commands.get('rect');
  if (gameRecruit?.handleModalSubmit) {
    try {
      await gameRecruit.handleModalSubmit(interaction);
    } catch (error) {
      console.error('モーダル送信処理中にエラー:', error);
      await safeRespond(interaction, { content: `モーダル送信処理でエラー: ${error.message || error}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

// ボタン処理 - 報告返信ボタン
async function handleReportReplyButton(interaction, authorId) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
  
  const replyModal = new ModalBuilder()
    .setCustomId(`report_reply_modal_${authorId}`)
    .setTitle('報告への返信を入力してください');
  
  const replyInput = new TextInputBuilder()
    .setCustomId('reply_content')
    .setLabel('返信内容')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(4000)
    .setRequired(true);
  
  const modalRow = new ActionRowBuilder().addComponents(replyInput);
  replyModal.addComponents(modalRow);
  
  await interaction.showModal(replyModal);
}

// ボタン処理 - ロール付与/削除
async function handleRoleButton(interaction, id) {
  const isGrant = id.startsWith('grant_role_');
  const roleId = id.replace(isGrant ? 'grant_role_' : 'remove_role_', '');
  
  if (!interaction.guild) {
    await safeRespond(interaction, { content: '❌ ギルド外では実行できません。', flags: MessageFlags.Ephemeral });
    return;
  }
  
  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await safeRespond(interaction, { content: '❌ 対象ロールが見つかりませんでした。', flags: MessageFlags.Ephemeral });
    return;
  }
  
  const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await safeRespond(interaction, { content: '❌ メンバー情報を取得できませんでした。', flags: MessageFlags.Ephemeral });
    return;
  }
  
  try {
    if (isGrant) {
      if (member.roles.cache.has(role.id)) {
        await safeRespond(interaction, { content: 'ℹ️ そのロールは既に付与されています。', flags: MessageFlags.Ephemeral });
      } else {
        await member.roles.add(role.id, 'Recrubo: update notification self-assign');
        await safeRespond(interaction, { content: '✅ ロールを付与しました。', flags: MessageFlags.Ephemeral });
      }
    } else {
      if (!member.roles.cache.has(role.id)) {
        await safeRespond(interaction, { content: 'ℹ️ そのロールは付与されていません。', flags: MessageFlags.Ephemeral });
      } else {
        await member.roles.remove(role.id, 'Recrubo: update notification self-remove');
        await safeRespond(interaction, { content: '✅ ロールを外しました。', flags: MessageFlags.Ephemeral });
      }
    }
  } catch (e) {
    console.error('[interactionCreate] role assign/remove failed:', e?.message || e);
    await safeRespond(interaction, { content: '❌ ロールの変更に失敗しました。ボット権限をご確認ください。', flags: MessageFlags.Ephemeral });
  }
}

// ボタン処理 - システムボタン  
async function handleSystemButtons(interaction, client) {
  const id = interaction.customId || '';
  
  if (id.startsWith('report_reply_')) {
    await handleComponentSafely(interaction, async () => {
      const authorId = id.replace('report_reply_', '');
      await handleReportReplyButton(interaction, authorId);
    });
    return true;
  }
  
  if (id.startsWith('grant_role_') || id.startsWith('remove_role_')) {
    await handleComponentSafely(interaction, () => handleRoleButton(interaction, id));
    return true;
  }

  if (id === 'one_time_support_invite') {
    await handleComponentSafely(interaction, async () => {
      const inviteUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
      await safeRespond(interaction, { content: `✅ 招待リンクはこちらです。\n<${inviteUrl}>`, flags: MessageFlags.Ephemeral });
    });
    return true;
  }

  if (id === 'help_back') {
    const helpCommand = client.commands.get('help');
    if (helpCommand?.handleButton) {
      await handleComponentSafely(interaction, () => helpCommand.handleButton(interaction));
      return true;
    }
  }
  
  return false;
}

// ボタン処理 - ギルド設定ボタン
async function handleGuildSettingsButtons(interaction, client) {
  const id = interaction.customId || '';
  const guildSettingsButtons = new Set([
    'set_recruit_channel',
    'set_recruit_channels',
    'set_notification_role',
    'set_notification_roles',
    'toggle_everyone',
    'toggle_here',
    'toggle_recruit_style',
    'toggle_dedicated_channel',
    'set_dedicated_category',
    'set_default_title',
    'set_default_color',
    'set_update_channel',
    'reset_all_settings',
    'finalize_settings',
    'create_template'
  ]);

  if (guildSettingsButtons.has(id)) {
    const guildSettings = getGuildSettingsCommand(client);
    if (guildSettings?.handleButtonInteraction) {
      await handleComponentSafely(interaction, () => guildSettings.handleButtonInteraction(interaction));
      return true;
    }
    await safeRespond(interaction, { content: '⚠️ 募集設定ボタンのハンドラが見つかりませんでした。', flags: MessageFlags.Ephemeral });
    return true;
  }
  
  return false;
}

// ボタン処理メイン
async function handleButton(interaction, client) {
  try {
    const handled = await handleSystemButtons(interaction, client);
    if (handled) return;
  } catch (e) {
    console.error('[interactionCreate] system button handling error:', e?.message || e);
  }

  try {
    const handled = await handleGuildSettingsButtons(interaction, client);
    if (handled) return;
  } catch (buttonRouteError) {
    console.error('[interactionCreate] guild settings button routing error:', buttonRouteError?.message || buttonRouteError);
  }

  const gameRecruit = client.commands.get('rect');
  if (gameRecruit?.handleButton) {
    await handleComponentSafely(interaction, () => gameRecruit.handleButton(interaction));
    return;
  }

  try {
    await safeRespond(interaction, { content: '⚠️ このボタンの処理が見つかりませんでした。', flags: MessageFlags.Ephemeral });
  } catch (_) {}
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try { /* reduce noisy receive logs */ } catch (_) {}

    // デデュープ処理
    const isDuplicate = handleInteractionDedupe(interaction, client);
    if (isDuplicate) return;

    // オートコンプリート
    if (interaction.isAutocomplete?.()) {
      await handleAutocomplete(interaction, client);
      return;
    }

    // スラッシュコマンド
    if (interaction.isChatInputCommand?.()) {
      await handleSlashCommand(interaction, client);
      return;
    }

    // 文字列選択メニュー
    if (interaction.isStringSelectMenu?.()) {
      await handleStringSelectMenu(interaction, client);
      return;
    }

    // ロール/チャンネル選択メニュー
    if (interaction.isRoleSelectMenu?.() || interaction.isChannelSelectMenu?.()) {
      await handleRoleChannelSelectMenu(interaction, client);
      return;
    }

    // モーダル送信
    if (interaction.isModalSubmit?.() || interaction.type === 5) {
      await handleModalSubmit(interaction, client);
      return;
    }

    // ボタン
    if (interaction.isButton?.()) {
      await handleButton(interaction, client);
      return;
    }
  },
};
