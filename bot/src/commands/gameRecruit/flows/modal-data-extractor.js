/**
 * モーダルデータ抽出モジュール
 * モーダルフィールドから募集データを抽出・構築
 */

const { pendingModalOptions } = require('../data/state');
const { fetchVoiceChannelName } = require('../data/data-loader');

/**
 * 既存メンバーをモーダルから抽出
 */
function extractExistingMembers(interaction) {
  try {
    const selectedMembers = interaction.fields.getSelectedMembers('existingMembers');
    if (selectedMembers && selectedMembers.size > 0) {
      return Array.from(selectedMembers.keys()).filter(id => {
        const member = selectedMembers.get(id);
        return id !== interaction.user.id && !(member?.user?.bot);
      });
    }
  } catch (_e) {
    return [];
  }
  return [];
}

/**
 * 通知ロールをモーダルから抽出
 */
function extractNotificationRole(interaction) {
  try {
    const values = interaction.fields.getStringSelectValues('notificationRole');
    if (values && values.length > 0) {
      const roleId = values[0];
      return roleId !== 'none' ? roleId : null;
    }
  } catch (_e) {
    return null;
  }
  return null;
}

/**
 * モーダルフィールドから通知情報を抽出（統合版）
 */
function extractModalDataFields(interaction) {
  let existingMembers = [];
  let selectedNotificationRole = null;
  
  try {
    const selectedMembers = interaction.fields.getSelectedMembers('existingMembers');
    if (selectedMembers && selectedMembers.size > 0) {
      existingMembers = Array.from(selectedMembers.keys()).filter(id => {
        const member = selectedMembers.get(id);
        return id !== interaction.user.id && !(member?.user?.bot);
      });
    }
  } catch (_e) {}
  
  try {
    const values = interaction.fields.getStringSelectValues('notificationRole');
    if (values && values.length > 0) {
      const roleId = values[0];
      if (roleId !== 'none') {
        selectedNotificationRole = roleId;
      }
    }
  } catch (_e) {}
  
  return { existingMembers, selectedNotificationRole };
}

/**
 * パネルカラーを解決（pendingまたはデフォルト）
 */
function resolvePanelColor(interaction, guildSettings) {
  let panelColor;
  try {
    const pending = interaction.user && interaction.user.id ? pendingModalOptions.get(interaction.user.id) : null;
    if (pending && typeof pending.panelColor === 'string' && pending.panelColor.length > 0) {
      panelColor = pending.panelColor;
    } else if (guildSettings?.defaultColor && typeof guildSettings.defaultColor === 'string') {
      panelColor = guildSettings.defaultColor;
    } else {
      panelColor = '5865F2';
    }
  } catch (e) {
    console.warn('handleModalSubmit: failed to retrieve pending modal options:', e?.message || e);
    if (typeof interaction.recruitPanelColor === 'string' && interaction.recruitPanelColor.length > 0) {
      panelColor = interaction.recruitPanelColor;
    } else if (guildSettings?.defaultColor) {
      panelColor = guildSettings.defaultColor;
    } else {
      panelColor = '5865F2';
    }
  }
  return panelColor;
}

/**
 * RecruitDataオブジェクトを構築（モーダル送信時）
 */
async function buildRecruitDataObj(interaction, pendingData, participantsNum, guildSettings) {
  const panelColor = resolvePanelColor(interaction, guildSettings);
  const voiceChannelName = await fetchVoiceChannelName(interaction.guild, pendingData?.voiceChannelId);

  return {
    title: (pendingData?.title?.trim().length > 0) ? pendingData.title : '参加者募集',
    content: interaction.fields.getTextInputValue('content'),
    participants: participantsNum || pendingData?.participants || 1,
    startTime: pendingData?.startTime || '',
    vc: pendingData?.voice || '',
    voicePlace: pendingData?.voicePlace,
    voiceChannelId: pendingData?.voiceChannelId,
    voiceChannelName,
    recruiterId: interaction.user.id,
    recruitId: '',
    panelColor,
    notificationRoleId: null,
    templateName: pendingData?.templateName || null,
    template: pendingData?.template || null,
    layout_json: pendingData?.template?.layout_json || null,
    background_image_url: pendingData?.template?.background_image_url || null
  };
}

/**
 * モーダルから募集データを構築（handleModalSubmit用）
 */
async function buildRecruitDataFromModal(interaction, guildSettings) {
  const panelColor = resolvePanelColor(interaction, guildSettings);
  const { existingMembers, selectedNotificationRole } = extractModalDataFields(interaction);
  const pendingData = pendingModalOptions.get(interaction.user.id);
  
  // 参加者数のパース
  let participantsNum = pendingData?.participants;
  if (!participantsNum || isNaN(participantsNum) || participantsNum < 1 || participantsNum > 16) {
    participantsNum = 1;
  }
  
  const voiceChannelName = await fetchVoiceChannelName(interaction.guild, pendingData?.voiceChannelId);

  const recruitDataObj = {
    title: (pendingData?.title && pendingData.title.trim().length > 0) ? pendingData.title : '参加者募集',
    content: interaction.fields.getTextInputValue('content'),
    participants: participantsNum,
    startTime: pendingData?.startTime || '',
    vc: pendingData?.voice || '',
    voicePlace: pendingData?.voicePlace,
    voiceChannelId: pendingData?.voiceChannelId,
    voiceChannelName,
    recruiterId: interaction.user.id,
    recruitId: '',
    panelColor,
    notificationRoleId: selectedNotificationRole,
    existingMembers,
    templateName: pendingData?.templateName || null,
    template: pendingData?.template || null,
    layout_json: pendingData?.template?.layout_json || null,
    background_image_url: pendingData?.template?.background_image_url || null
  };

  if (interaction.user?.id) {
    pendingModalOptions.delete(interaction.user.id);
  }
  return recruitDataObj;
}

module.exports = {
  extractExistingMembers,
  extractNotificationRole,
  extractModalDataFields,
  resolvePanelColor,
  buildRecruitDataObj,
  buildRecruitDataFromModal
};
