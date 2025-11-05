// P0修正: インタラクション処理の共通ユーティリティ
// - deferReplyの標準化
// - 二重応答防止の安全な返信関数
// - 統一エラーハンドリング

const { MessageFlags } = require('discord.js');

/**
 * 安全にdeferReplyを実行（既にdefer済み/返信済みの場合はスキップ）
 * @param {Interaction} interaction 
 * @param {Object} options defer options (ephemeral等)
 * @returns {Promise<boolean>} defer成功ならtrue
 */
async function safeDeferReply(interaction, options = { ephemeral: true }) {
  try {
    if (interaction.deferred || interaction.replied) {
      return false;
    }
    await interaction.deferReply(options);
    return true;
  } catch (e) {
    console.warn('[interactionHandler] safeDeferReply failed:', e?.message || e);
    return false;
  }
}

/**
 * 二重応答(40060)を避けるための安全な返信関数
 * @param {Interaction} interaction 
 * @param {Object} payload reply/followUp payload
 * @returns {Promise<Message>}
 */
async function safeRespond(interaction, payload) {
  try {
    // 既にdefer/reply済みならfollowUp、それ以外はreply
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (e) {
    // Discord API error 40060 (Unknown interaction) の場合のフォールバック
    if (e && (e.code === 40060 || e.status === 400)) {
      try {
        return await interaction.followUp(payload);
      } catch (fallbackError) {
        console.error('[interactionHandler] safeRespond fallback also failed:', fallbackError?.message || fallbackError);
        throw fallbackError;
      }
    }
    throw e;
  }
}

/**
 * 統一エラーハンドリング: コマンド実行をtry/catchでラップし、エラー時に安全に返信
 * @param {Interaction} interaction 
 * @param {Function} handler コマンドの実行関数
 * @param {Object} deferOptions deferReplyのオプション
 */
async function handleCommandSafely(interaction, handler, deferOptions = { ephemeral: true }) {
  try {
    // P0修正: コマンド処理前に標準的にdeferReply
    await safeDeferReply(interaction, deferOptions);
    
    // コマンドハンドラーを実行
    await handler(interaction);
  } catch (error) {
    console.error(`[interactionHandler] Error in command ${interaction.commandName}:`, error);
    
    // エラーメッセージを安全に返信
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'コマンド実行中にエラーが発生しました。'
      : `エラー: ${error?.message || error}`;
    
    try {
      await safeRespond(interaction, {
        content: errorMessage,
        flags: MessageFlags.Ephemeral
      });
    } catch (respondError) {
      console.error('[interactionHandler] Failed to send error response:', respondError?.message || respondError);
    }
  }
}

/**
 * ボタン/セレクトメニュー等のコンポーネント用の統一ハンドラー
 * @param {Interaction} interaction 
 * @param {Function} handler コンポーネントの処理関数
 */
async function handleComponentSafely(interaction, handler) {
  try {
    await handler(interaction);
  } catch (error) {
    console.error(`[interactionHandler] Error in component ${interaction.customId}:`, error);
    
    const errorMessage = process.env.NODE_ENV === 'production'
      ? '処理中にエラーが発生しました。'
      : `エラー: ${error?.message || error}`;
    
    try {
      await safeRespond(interaction, {
        content: errorMessage,
        flags: MessageFlags.Ephemeral
      });
    } catch (respondError) {
      console.error('[interactionHandler] Failed to send error response:', respondError?.message || respondError);
    }
  }
}

module.exports = {
  safeDeferReply,
  safeRespond,
  handleCommandSafely,
  handleComponentSafely
};
