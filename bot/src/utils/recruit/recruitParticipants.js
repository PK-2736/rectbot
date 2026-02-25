const { AttachmentBuilder, MessageFlags } = require('discord.js');
const { buildContainer, buildContainerSimple } = require('./recruitHelpers');
const { hydrateRecruitData, fetchRecruitData } = require('./recruitData');
const db = require('../database');

/**
 * 参加者リストを更新（メッセージに反映）
 * @param {Object} interactionOrMessage - Interaction またはMessage オブジェクト
 * @param {Array<string>} participants - 参加者UserID配列
 * @param {Object} savedRecruitData - 保存された募集データ（オプション）
 */
async function updateParticipantList(interactionOrMessage, participants, savedRecruitData) {
  try {
    const { message, client } = _extractMessageContext(interactionOrMessage);
    if (!message || !client) return;

    const messageId = message.id;
    const recruitId = String(messageId).slice(-8);

    // 募集データの取得
    if (!savedRecruitData) {
      savedRecruitData = await fetchRecruitData(recruitId);
      if (!savedRecruitData) {
        console.warn('updateParticipantList: recruitData unavailable; persisting participants only');
        try {
          await db.saveParticipantsToRedis(messageId, participants);
        } catch (_) {}
        return;
      }
    }

    savedRecruitData = hydrateRecruitData(savedRecruitData);
    try {
      await db.saveRecruitToRedis(recruitId, savedRecruitData);
    } catch (_) {}

    // ギルド設定を取得
    const guildId = _resolveGuildId(savedRecruitData, message);
    const guildSettings = await db.getGuildSettings(guildId);

    // メッセージコンテンツの構築
    const { container, image } = await _buildMessageContent(
      savedRecruitData,
      participants,
      client,
      guildSettings
    );

    // メッセージを編集
    await _editMessageAndSaveParticipants(message, container, image, messageId, participants);
  } catch (err) {
    console.error('updateParticipantList error:', err);
  }
}

/**
 * メッセージコンテキスト（message, client）を抽出
 */
function _extractMessageContext(interactionOrMessage) {
  let interaction = null;
  let message = null;

  if (interactionOrMessage?.message) {
    interaction = interactionOrMessage;
    message = interaction.message;
  } else {
    message = interactionOrMessage;
  }

  const client = interaction?.client || message?.client;
  return { interaction, message, client };
}

/**
 * ギルドIDを解決
 */
function _resolveGuildId(savedRecruitData, message) {
  return savedRecruitData?.guildId || message?.guildId;
}

/**
 * メッセージコンテンツ（コンテナ + 画像）を構築
 */
async function _buildMessageContent(recruitData, participants, client, guildSettings) {
  const style = guildSettings?.recruit_style === 'simple' ? 'simple' : 'image';
  let image = null;

  // 画像を生成
  if (style === 'image') {
    const useColor = _resolveRecruitColor(recruitData, guildSettings);
    const { generateRecruitCardQueued } = require('../canvas/imageQueue');
    const buffer = await generateRecruitCardQueued(recruitData, participants, client, useColor);
    image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
  }

  // コンテナを構築
  const container = await _buildContainer(recruitData, participants, client, style);

  return { container, image };
}

/**
 * 募集カラーを解決して16進数に
 */
function _resolveRecruitColor(recruitData, guildSettings) {
  let useColor = recruitData?.panelColor || guildSettings?.defaultColor || '000000';
  if (typeof useColor === 'string' && useColor.startsWith('#')) {
    useColor = useColor.slice(1);
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(useColor)) {
    useColor = '000000';
  }
  return useColor;
}

/**
 * スタイル（simple/image）に応じたコンテナを構築
 */
async function _buildContainer(recruitData, participants, client, style) {
  const useColor = _resolveRecruitColor(recruitData, {});
  const accentColor = parseInt(useColor, 16);

  // 共通要素を構築
  const participantText = _buildParticipantText(recruitData, participants);
  const headerTitle = await _resolveRecruiterInfo(recruitData, client);
  const subHeaderText = _buildNotificationRoleText(recruitData);
  const avatarUrl = await _resolveAvatarUrl(recruitData, client);
  const recruitIdText = _buildRecruitIdText(recruitData);
  const extraActionButtons = await _buildExtraActionButtons(recruitData);

  if (style === 'simple') {
    return _buildSimpleContainer(
      recruitData,
      participantText,
      headerTitle,
      subHeaderText,
      avatarUrl,
      recruitIdText,
      accentColor,
      extraActionButtons
    );
  } else {
    return buildContainer({
      headerTitle,
      contentText: recruitData?.note || recruitData?.content || '',
      titleText: recruitData?.title ? `📌 タイトル\n${String(recruitData.title).slice(0, 200)}` : '',
      participantText,
      recruitIdText,
      accentColor,
      imageAttachmentName: 'attachment://recruit-card.png',
      recruiterId: recruitData?.recruiterId || null,
      requesterId: null,
      subHeaderText,
      avatarUrl,
      extraActionButtons
    });
  }
}

/**
 * 参加者リストテキストを構築
 */
function _buildParticipantText(recruitData, participants) {
  const totalSlots = recruitData?.participants || recruitData?.participant_count || 1;
  const remainingSlots = totalSlots - participants.length;
  return `📋 参加リスト (**あと${remainingSlots}人**)\n${participants.map(id => `<@${id}>`).join(' • ')}`;
}

/**
 * 通知ロールテキストを構築
 */
function _buildNotificationRoleText(recruitData) {
  try {
    const selectedNotificationRole = recruitData?.notificationRoleId;

    if (!selectedNotificationRole) return null;

    if (selectedNotificationRole === 'everyone') {
      return '🔔 通知ロール: @everyone';
    }
    if (selectedNotificationRole === 'here') {
      return '🔔 通知ロール: @here';
    }
    return `🔔 通知ロール: <@&${selectedNotificationRole}>`;
  } catch (e) {
    console.warn('_buildNotificationRoleText failed:', e?.message || e);
    return null;
  }
}

/**
 * リクルーター情報（ユーザー名）を解決
 */
async function _resolveRecruiterInfo(recruitData, client) {
  let headerTitle = recruitData?.title || '募集';
  try {
    if (recruitData?.recruiterId && client) {
      const user = await client.users.fetch(recruitData.recruiterId).catch(() => null);
      if (user && (user.username || user.displayName || user.tag)) {
        const name = user.username || user.displayName || user.tag;
        headerTitle = `${name}さんの募集`;
      }
    }
  } catch (e) {
    console.warn('_resolveRecruiterInfo failed:', e?.message || e);
  }
  return headerTitle;
}

/**
 * アバターURLを解決
 */
async function _resolveAvatarUrl(recruitData, client) {
  try {
    if (recruitData?.recruiterId && client) {
      const user = await client.users.fetch(recruitData.recruiterId).catch(() => null);
      if (user && typeof user.displayAvatarURL === 'function') {
        return user.displayAvatarURL({ size: 64, extension: 'png' });
      }
    }
  } catch (e) {
    console.warn('_resolveAvatarUrl failed:', e?.message || e);
  }
  return null;
}

/**
 * 募集IDテキストを構築
 */
function _buildRecruitIdText(recruitData) {
  if (recruitData?.recruitId) return recruitData.recruitId;
  if (recruitData?.message_id) return recruitData.message_id.slice(-8);
  return '(unknown)';
}

/**
 * エクストラアクションボタンを構築
 */
async function _buildExtraActionButtons(_recruitData) {
  const buttons = [];
  try {
    // TODO: ギルド設定に基づいて追加ボタンを構築
    // 専用チャンネル作成ボタンなど
  } catch (e) {
    console.warn('_buildExtraActionButtons failed:', e?.message || e);
  }
  return buttons;
}

/**
 * シンプスタイルのコンテナを構築
 */
function _buildSimpleContainer(
  recruitData,
  participantText,
  headerTitle,
  subHeaderText,
  avatarUrl,
  recruitIdText,
  accentColor,
  extraActionButtons
) {
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  const startVal = recruitData?.startTime ? String(recruitData.startTime) : null;
  const membersVal = typeof (recruitData?.participants || recruitData?.participant_count) === 'number'
    ? `${recruitData.participants || recruitData.participant_count}人`
    : null;
  const voiceVal = _resolveVoiceValue(recruitData);

  const valuesLine = [startVal, membersVal, voiceVal].filter(Boolean).join(' | ');
  const details = [labelsLine, valuesLine].filter(Boolean).join('\n');

  const contentTextValue = recruitData?.note || recruitData?.content || '';
  const contentText =
    contentTextValue && String(contentTextValue).trim().length > 0
      ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}`
      : '';

  return buildContainerSimple({
    headerTitle,
    detailsText: details,
    contentText,
    titleText: recruitData?.title ? `## ${String(recruitData.title).slice(0, 200)}` : '',
    participantText,
    recruitIdText,
    accentColor,
    subHeaderText,
    avatarUrl,
    extraActionButtons
  });
}

/**
 * 音声有無テキストを解決
 */
function _resolveVoiceValue(recruitData) {
  if (typeof recruitData?.vc === 'string') {
    if (recruitData.vc === 'あり(聞き専)') {
      return recruitData?.voicePlace ? `聞き専/${recruitData.voicePlace}` : '聞き専';
    }
    if (recruitData.vc === 'あり') {
      return recruitData?.voicePlace ? `あり/${recruitData.voicePlace}` : 'あり';
    }
    if (recruitData.vc === 'なし') {
      return 'なし';
    }
  }
  if (recruitData?.voice === true) {
    return recruitData?.voicePlace ? `あり/${recruitData.voicePlace}` : 'あり';
  }
  if (recruitData?.voice === false) {
    return 'なし';
  }
  return null;
}

/**
 * メッセージを編集して参加者を保存
 */
async function _editMessageAndSaveParticipants(message, container, image, messageId, participants) {
  const editPayload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: [] }
  };

  if (image) {
    editPayload.files = [image];
  }

  await message.edit(editPayload);
  await db.saveParticipantsToRedis(messageId, participants);
}

module.exports = {
  updateParticipantList
};
