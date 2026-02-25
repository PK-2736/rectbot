/**
 * Embed 構築モジュール
 * Discord Embed メッセージの生成
 */
const embedBuilder = require('./embedBuilder');
const {
  createErrorEmbed,
  createSuccessEmbed,
  createInfoEmbed,
  createWarningEmbed
} = require('./embedHelpers');

module.exports = {
  ...embedBuilder,
  createErrorEmbed,
  createSuccessEmbed,
  createInfoEmbed,
  createWarningEmbed
};
