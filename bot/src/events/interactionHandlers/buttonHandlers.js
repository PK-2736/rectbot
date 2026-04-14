/**
 * buttonHandlers.js
 * Handles all button interactions
 */

const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { safeRespond, handleComponentSafely } = require('../../utils/interactionHandler');

// ギルド設定コマンド解決ヘルパー（setting が優先）
function getGuildSettingsCommand(client) {
  return client.commands.get('setting') || client.commands.get('rect-setting');
}

// ギルド設定ボタンセット
const guildSettingsButtons = new Set([
  'set_recruit_channel',
  'set_recruit_channels',
  'set_notification_role',
  'set_notification_roles',
  'toggle_everyone',
  'toggle_here',
  'toggle_recruit_style',
  'toggle_dedicated_channel',
  'set_dedicated_channel_type',
  'set_default_title',
  'set_default_color',
  'set_update_channel',
  'reset_all_settings',
  'finalize_settings',
  'create_template',
  'open_template_customizer_web',
  'set_template_customizer_mode',
  'set_template_customizer_roles',
  'set_template_customizer_users'
]);

/**
 * Handle report reply button
 */
async function handleReportReplyButton(interaction) {
  const authorId = interaction.customId.replace('report_reply_', '');
  
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

/**
 * Handle role grant or removal
 */
async function handleRoleGrantOrRemove(interaction, id) {
  const isGrant = id.startsWith('grant_role_');
  const roleId = id.replace(isGrant ? 'grant_role_' : 'remove_role_', '');
  
  if (!interaction.guild) {
    await safeRespond(interaction, { 
      content: '❌ ギルド外では実行できません。', 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await safeRespond(interaction, { 
      content: '❌ 対象ロールが見つかりませんでした。', 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await safeRespond(interaction, { 
      content: '❌ メンバー情報を取得できませんでした。', 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  try {
    if (isGrant) {
      if (member.roles.cache.has(role.id)) {
        await safeRespond(interaction, { 
          content: 'ℹ️ そのロールは既に付与されています。', 
          flags: MessageFlags.Ephemeral 
        });
      } else {
        await member.roles.add(role.id, 'Recrubo: update notification self-assign');
        await safeRespond(interaction, { 
          content: '✅ ロールを付与しました。', 
          flags: MessageFlags.Ephemeral 
        });
      }
    } else {
      if (!member.roles.cache.has(role.id)) {
        await safeRespond(interaction, { 
          content: 'ℹ️ そのロールは付与されていません。', 
          flags: MessageFlags.Ephemeral 
        });
      } else {
        await member.roles.remove(role.id, 'Recrubo: update notification self-remove');
        await safeRespond(interaction, { 
          content: '✅ ロールを外しました。', 
          flags: MessageFlags.Ephemeral 
        });
      }
    }
  } catch (e) {
    console.error('[handleRoleGrantOrRemove] error:', e?.message || e);
    await safeRespond(interaction, { 
      content: '❌ ロールの変更に失敗しました。ボット権限をご確認ください。', 
      flags: MessageFlags.Ephemeral 
    });
  }
}

/**
 * Handle support invite button
 */
async function handleSupportInviteButton(interaction) {
  const inviteUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
  await safeRespond(interaction, {
    content: `✅ 招待リンクはこちらです。\n<${inviteUrl}>`,
    flags: MessageFlags.Ephemeral
  });
}

/**
 * Main button interaction handler
 */
async function handleButtonInteraction(interaction, client) {
  const id = interaction.customId || '';

  // 特別なボタン処理
  try {
    if (id.startsWith('report_reply_')) {
      return await handleReportReplyButton(interaction);
    }
    if (id.startsWith('grant_role_') || id.startsWith('remove_role_')) {
      return await handleRoleGrantOrRemove(interaction, id);
    }
    if (id === 'one_time_support_invite') {
      return await handleSupportInviteButton(interaction);
    }
    if (id === 'help_back') {
      const helpCommand = client.commands.get('help');
      if (helpCommand && typeof helpCommand.handleButton === 'function') {
        return await handleComponentSafely(interaction, () => helpCommand.handleButton(interaction));
      }
    }
    if (id.startsWith('subscription_pay_agree:') || id.startsWith('subscription_pay_cancel:')) {
      const subscriptionCommand = client.commands.get('subscription');
      if (subscriptionCommand && typeof subscriptionCommand.handleButton === 'function') {
        return await handleComponentSafely(interaction, () => subscriptionCommand.handleButton(interaction));
      }
    }
  } catch (e) {
    console.error('[handleButtonInteraction] error:', e?.message || e);
  }

  // ギルド設定ボタン
  if (guildSettingsButtons.has(id)) {
    const guildSettings = getGuildSettingsCommand(client);
    if (guildSettings && typeof guildSettings.handleButtonInteraction === 'function') {
      return await handleComponentSafely(interaction, () => guildSettings.handleButtonInteraction(interaction));
    }
    await safeRespond(interaction, { 
      content: '⚠️ 募集設定ボタンのハンドラが見つかりませんでした。', 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }

  // gameRecruit ボタン
  const gameRecruit = client.commands.get('rect');
  if (gameRecruit && typeof gameRecruit.handleButton === 'function') {
    return await handleComponentSafely(interaction, () => gameRecruit.handleButton(interaction));
  }

  // 不明なボタン
  try {
    await safeRespond(interaction, { 
      content: '⚠️ このボタンの処理が見つかりませんでした。', 
      flags: MessageFlags.Ephemeral 
    });
  } catch (_) {}
}

module.exports = {
  handleButtonInteraction,
  handleReportReplyButton,
  handleRoleGrantOrRemove,
  handleSupportInviteButton
};
