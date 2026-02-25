/**
 * ユーティリティモジュール統合エントリポイント
 * すべてのサブモジュールを統一して提供
 */

// 各カテゴリのモジュール
const canvas = require('./canvas');
const embed = require('./embed');
const auth = require('./auth');
const error = require('./error');
const game = require('./game');
const common = require('./common');
const notification = require('./notification');
const database = require('./database');
const recruit = require('./recruit');

// 後方互換性のため、すべてをトップレベルにもエクスポート
module.exports = {
  // 直接エクスポート（後方互換性）
  ...canvas,
  ...embed,
  ...auth,
  ...error,
  ...game,
  ...common,
  ...notification,
  ...database,
  ...recruit,

  // 名前空間アクセス
  canvas,
  embed,
  auth,
  error,
  game,
  common,
  notification,
  database,
  recruit
};
