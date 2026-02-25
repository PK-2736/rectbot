/**
 * エラー処理モジュール
 * 統一的なエラーハンドリングと通知
 */
const ErrorHandler = require('./errorHandler');
const { handlePermissionError } = require('./handlePermissionError');
const Sentry = require('./sentry');

module.exports = {
  ErrorHandler,
  handlePermissionError,
  Sentry
};
