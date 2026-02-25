/**
 * 共通ユーティリティモジュール
 * 再利用可能なヘルパー関数群
 */
const { safeReply } = require('./safeReply');
const workerApiClient = require('./workerApiClient');
const { fetchBackend } = require('./backendFetch');
const interactionHandler = require('./interactionHandler');
const leaderElector = require('./leaderElector');

module.exports = {
  safeReply,
  workerApiClient,
  fetchBackend,
  interactionHandler,
  leaderElector
};
