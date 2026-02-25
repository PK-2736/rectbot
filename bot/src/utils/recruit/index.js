/**
 * 募集モジュール
 * 募集メッセージの管理と参加者管理
 */
const { updateParticipantList } = require('./recruitParticipants');
const { autoCloseRecruitment } = require('./recruitClosure');
const { hydrateRecruitData, fetchRecruitData } = require('./recruitData');

module.exports = {
  updateParticipantList,
  autoCloseRecruitment,
  hydrateRecruitData,
  fetchRecruitData
};
