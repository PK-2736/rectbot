/**
 * modalHandlers.js
 * Handles all modal submit interactions
 */

const { MessageFlags, EmbedBuilder } = require('discord.js');
const { safeRespond } = require('../../utils/interactionHandler');

// ギルド設定コマンド解決ヘルパー（setting が優先）
function getGuildSettingsCommand(client) {
  return client.commands.get('setting') || client.commands.get('rect-setting');
}

// モーダルハンドラーマッピング
const modalHandlerMap = {
  'default_title_modal': (client) => getGuildSettingsCommand(client),
  'default_color_modal': (client) => getGuildSettingsCommand(client),
  'template_create_modal': (client) => getGuildSettingsCommand(client),
  'template_optional_modal': (client) => getGuildSettingsCommand(client),
  'editRecruitModal_': (client) => client.commands.get('rect_edit'),
  'friend_code_add_modal': (client) => client.commands.get('id_add'),
  'report_modal_': (client) => client.commands.get('report'),
  'default': (client) => client.commands.get('rect')
};

/**
 * Handle report reply modal submission
 */
async function handleReportReplyModal(interaction) {
  const authorId = interaction.customId.replace('report_reply_modal_', '');
  const replyContent = interaction.fields.getTextInputValue('reply_content');
  
  try {
    const user = await interaction.client.users.fetch(authorId).catch(() => null);
    if (!user) {
      await safeRespond(interaction, {
        content: '❌ ユーザーが見つかりませんでした。',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
      return;
    }
    
    const replyEmbed = new EmbedBuilder()
      .setTitle('📨 Recrubo開発者からの返信')
      .setDescription(replyContent)
      .setColor(0x4C8DFF)
      .setFooter({ text: 'Recrubo Bot' })
      .setTimestamp();
    
    await user.send({ embeds: [replyEmbed] });
    
    await safeRespond(interaction, {
      content: '✅ ユーザーにDMを送信しました。',
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
    
    console.log(`[report] 返信をユーザーに送信しました - ユーザーID: ${authorId}`);
  } catch (error) {
    console.error('[handleReportReplyModal] error:', error);
    await safeRespond(interaction, {
      content: `❌ 返信の送信に失敗しました: ${error.message}`,
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
  }
}

/**
 * Main modal interaction handler
 */
async function handleModalInteraction(interaction, client) {
  // report返信モーダルの特別処理
  if (interaction.customId.startsWith('report_reply_modal_')) {
    return await handleReportReplyModal(interaction);
  }

  // ハンドラーを特定
  let handler = null;
  for (const [key, getCmd] of Object.entries(modalHandlerMap)) {
    if (key === 'default') continue;
    if (key.endsWith('_') ? interaction.customId.startsWith(key) : interaction.customId === key) {
      handler = getCmd(client);
      break;
    }
  }

  // デフォルトは gameRecruit
  if (!handler) {
    handler = modalHandlerMap.default(client);
  }

  if (handler && typeof handler.handleModalSubmit === 'function') {
    try {
      await handler.handleModalSubmit(interaction);
    } catch (error) {
      console.error('[handleModalInteraction] error:', error);
      await safeRespond(interaction, {
        content: `モーダル処理でエラー: ${error.message || error}`,
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  } else {
    console.warn('[handleModalInteraction] handler not found for modal:', interaction.customId);
    await safeRespond(interaction, { 
      content: '処理ハンドラが見つかりませんでした。', 
      flags: MessageFlags.Ephemeral 
    }).catch(() => {});
  }
}

module.exports = {
  handleModalInteraction,
  handleReportReplyModal
};
