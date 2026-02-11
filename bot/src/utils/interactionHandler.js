// P0修正: インタラクション処理の共通ユーティリティ
// - deferReplyの標準化
// - 二重応答防止の安全な返信関数
// - 統一エラーハンドリング

const { MessageFlags } = require('discord.js');
const { handlePermissionError } = require('./handlePermissionError');

function isPermissionError(error) {
  return !!(error && (error.code === 50001 || error.code === 50013));
}

function isUnknownInteractionError(error) {
  return !!(error && (error.code === 40060 || error.status === 400));
}

async function attemptInteractionCall(call) {
  try {
    return { ok: true, result: await call() };
  } catch (error) {
    return { ok: false, error };
  }
}

function buildErrorMessage(error, defaultMessage) {
  if (process.env.NODE_ENV === 'production') {
    return isPermissionError(error)
      ? '⚠️ 権限エラーが発生しました。詳細はDMをご確認ください。'
      : defaultMessage;
  }
  return `エラー: ${error?.message || error}`;
}

async function notifyPermissionError(user, error, context) {
  if (!isPermissionError(error)) return;
  try {
    await handlePermissionError(user, error, context);
  } catch (dmErr) {
    console.error('[interactionHandler] Failed to send permission error DM:', dmErr?.message || dmErr);
  }
}

async function respondWithError(interaction, message) {
  try {
    await safeRespond(interaction, {
      content: message,
      flags: MessageFlags.Ephemeral
    });
  } catch (respondError) {
    console.error('[interactionHandler] Failed to send error response:', respondError?.message || respondError);
  }
}

async function handleInteractionError(interaction, error, options) {
  const { contextLabel, defaultMessage, permissionContext } = options;
  console.error(`[interactionHandler] Error in ${contextLabel}:`, error);
  await notifyPermissionError(interaction.user, error, permissionContext);
  const errorMessage = buildErrorMessage(error, defaultMessage);
  await respondWithError(interaction, errorMessage);
}

/**
 * 安全にdeferReplyを実行（既にdefer済み/返信済みの場合はスキップ）
 * @param {Interaction} interaction 
 * @param {Object} options defer options (flags推奨)
 * @returns {Promise<boolean>} defer成功ならtrue
 */
async function safeDeferReply(interaction, options = { flags: MessageFlags.Ephemeral }) {
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
  const shouldFollowUp = interaction.deferred || interaction.replied;
  const primaryCall = shouldFollowUp
    ? () => interaction.followUp(payload)
    : () => interaction.reply(payload);

  const primaryResult = await attemptInteractionCall(primaryCall);
  if (primaryResult.ok) return primaryResult.result;

  if (isUnknownInteractionError(primaryResult.error)) {
    const fallbackResult = await attemptInteractionCall(() => interaction.followUp(payload));
    if (fallbackResult.ok) return fallbackResult.result;
    console.error('[interactionHandler] safeRespond fallback also failed:', fallbackResult.error?.message || fallbackResult.error);
    throw fallbackResult.error;
  }

  throw primaryResult.error;
}

/**
 * 統一エラーハンドリング: コマンド実行をtry/catchでラップし、エラー時に安全に返信
 * @param {Interaction} interaction 
 * @param {Function} handler コマンドの実行関数
 * @param {Object} deferOptions deferReplyのオプション（flags推奨）
 */
async function handleCommandSafely(interaction, handler, options = { defer: true, deferOptions: { flags: MessageFlags.Ephemeral } }) {
  try {
    // P0修正: コマンド処理前に標準的にdeferReply
    const shouldDefer = !(options && options.defer === false);
    if (shouldDefer) {
      const deferOpts = (options && options.deferOptions) ? options.deferOptions : { flags: MessageFlags.Ephemeral };
      await safeDeferReply(interaction, deferOpts);
    }
    
    // コマンドハンドラーを実行
    await handler(interaction);
  } catch (error) {
    await handleInteractionError(interaction, error, {
      contextLabel: `command ${interaction.commandName}`,
      defaultMessage: 'コマンド実行中にエラーが発生しました。',
      permissionContext: { commandName: interaction.commandName }
    });
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
    await handleInteractionError(interaction, error, {
      contextLabel: `component ${interaction.customId}`,
      defaultMessage: '処理中にエラーが発生しました。'
    });
  }
}

module.exports = {
  safeDeferReply,
  safeRespond,
  handleCommandSafely,
  handleComponentSafely
};
