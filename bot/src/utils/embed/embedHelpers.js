const { EmbedBuilder } = require('discord.js');

/**
 * エラーメッセージ用のEmbedを作成
 * @param {string} message - エラーメッセージ
 * @param {string} [title] - タイトル（デフォルト: エラー）
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(message, title = 'エラー') {
  return new EmbedBuilder()
    .setColor(0xFF0000) // 赤色
    .setTitle(`❌ ${title}`)
    .setDescription(message)
    .setTimestamp();
}

/**
 * 成功メッセージ用のEmbedを作成
 * @param {string} message - 成功メッセージ
 * @param {string} [title] - タイトル（デフォルト: 成功）
 * @returns {EmbedBuilder}
 */
function createSuccessEmbed(message, title = '成功') {
  return new EmbedBuilder()
    .setColor(0x00FF00) // 緑色
    .setTitle(`✅ ${title}`)
    .setDescription(message)
    .setTimestamp();
}

/**
 * 情報メッセージ用のEmbedを作成
 * @param {string} message - 情報メッセージ
 * @param {string} [title] - タイトル（デフォルト: 情報）
 * @returns {EmbedBuilder}
 */
function createInfoEmbed(message, title = '情報') {
  return new EmbedBuilder()
    .setColor(0x3B82F6) // 青色
    .setTitle(`ℹ️ ${title}`)
    .setDescription(message)
    .setTimestamp();
}

/**
 * 警告メッセージ用のEmbedを作成
 * @param {string} message - 警告メッセージ
 * @param {string} [title] - タイトル（デフォルト: 警告）
 * @returns {EmbedBuilder}
 */
function createWarningEmbed(message, title = '警告') {
  return new EmbedBuilder()
    .setColor(0xFFA500) // オレンジ色
    .setTitle(`⚠️ ${title}`)
    .setDescription(message)
    .setTimestamp();
}

module.exports = {
  createErrorEmbed,
  createSuccessEmbed,
  createInfoEmbed,
  createWarningEmbed,
};
