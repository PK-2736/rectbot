/**
 * 通知モジュール
 * メール通知、開始時刻通知など
 */
const emailNotifier = require('./emailNotifier');

module.exports = {
  ...emailNotifier
};
