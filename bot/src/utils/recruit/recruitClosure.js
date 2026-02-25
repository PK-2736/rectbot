const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags
} = require('discord.js');
const { hydrateRecruitData } = require('./recruitData');
const db = require('../database');

/**
 * 募集を自動終了（タイムアウト時）
 * @param {Object} client - Discordクライアント
 * @param {string} guildId - ギルドID
 * @param {string} channelId - チャンネルID
 * @param {string} messageId - メッセージID
 */
async function autoCloseRecruitment(client, guildId, channelId, messageId) {
  console.log('[autoClose] Triggered for message:', messageId, 'guild:', guildId, 'channel:', channelId);

  try {
    if (!client) throw new Error('client unavailable');

    const recruitId = String(messageId).slice(-8);

    // 募集データと情報を取得
    let recruitData = await _fetchRecruitmentData(recruitId);
    if (recruitData) recruitData = hydrateRecruitData(recruitData);
    const recruiterId = recruitData?.recruiterId || recruitData?.ownerId || null;

    // メッセージを取得・更新
    const message = await _fetchRecruitmentMessage(client, channelId, messageId);
    if (message) {
      await _updateMessageToClosed(message, recruitData, recruitId);
      await _notifyRecruiterOfClosure(message, recruiterId);
    } else {
      console.warn('[autoClose] Message not found (manual deletion):', messageId);
    }

    // キャッシュをクリーンアップ（メッセージの有無に関わらず実行）
    await _cleanupRecruitmentCaches(messageId, recruitId, recruiterId);

    console.log('[autoClose] Completed for message:', messageId, '- All caches cleared');
  } catch (error) {
    console.error('[autoClose] Unexpected error:', error);
  }
}

/**
 * 募集データを取得
 */
async function _fetchRecruitmentData(recruitId) {
  try {
    let data = await db.getRecruitFromRedis(recruitId);
    if (data) return data;

    const workerRes = await db.getRecruitFromWorker(recruitId);
    if (workerRes?.ok) return workerRes.body;
  } catch (e) {
    console.warn('[autoClose] fetchRecruitmentData failed:', e?.message || e);
  }
  return null;
}

/**
 * メッセージを取得
 */
async function _fetchRecruitmentMessage(client, channelId, messageId) {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return null;
    return await channel.messages.fetch(messageId).catch(() => null);
  } catch (e) {
    console.warn('[autoClose] fetchRecruitmentMessage failed:', e?.message || e);
    return null;
  }
}

/**
 * メッセージを締め切り状態に更新
 */
async function _updateMessageToClosed(message, recruitData, recruitId) {
  try {
    const baseColor = _resolveBaseColor(recruitData);
    const closedAttachment = await _buildClosureImage(message);
    const disabledContainer = _buildClosureContainer(recruitData, recruitId, closedAttachment);
    const disabledButtons = _buildDisabledButtons();

    const editPayload = {
      components: [disabledContainer, disabledButtons],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { roles: [], users: [] }
    };

    if (closedAttachment) {
      editPayload.files = [closedAttachment];
    }

    await message.edit(editPayload);
  } catch (e) {
    console.warn('[autoClose] Failed to update message:', e?.message || e);
  }
}

/**
 * ベースカラーを解決
 */
function _resolveBaseColor(recruitData) {
  const src = recruitData?.panelColor || '808080';
  const cleaned = typeof src === 'string' && src.startsWith('#') ? src.slice(1) : src;
  return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : 0x808080;
}

/**
 * 締め切り画像を構築
 */
async function _buildClosureImage(message) {
  try {
    const originalAttachment = message.attachments.first();
    if (!originalAttachment?.url) return null;

    const response = await fetch(originalAttachment.url);
    const arrayBuffer = await response.arrayBuffer();
    const originalImageBuffer = Buffer.from(arrayBuffer);

    const { generateClosedRecruitCardQueued } = require('../canvas/imageQueue');
    const closedImageBuffer = await generateClosedRecruitCardQueued(originalImageBuffer);

    return new AttachmentBuilder(closedImageBuffer, { name: 'recruit-card-closed.png' });
  } catch (e) {
    console.warn('[autoClose] Failed to generate closed image:', e?.message || e);
    return null;
  }
}

/**
 * 締め切りコンテナを構築
 */
function _buildClosureContainer(recruitData, recruitId, closedAttachment) {
  const baseColor = _resolveBaseColor(recruitData);

  const container = new ContainerBuilder();
  container.setAccentColor(baseColor);

  if (closedAttachment) {
    _buildClosureContainerWithImage(container, recruitId);
  } else {
    _buildClosureContainerFallback(container, recruitId);
  }

  return container;
}

/**
 * 締め切りコンテナ（画像版）を構築
 */
function _buildClosureContainerWithImage(container, recruitId) {
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('attachment://recruit-card-closed.png')
    )
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // 最終参加リスト
  const finalParticipantText = `📋 参加リスト (最終)\n🔒 この募集は締め切られました。`;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(finalParticipantText));
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  // フッター
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`募集ID：\`${recruitId}\` | powered by **Recrubo**`)
  );
}

/**
 * 締め切りコンテナ（フォールバック）を構築
 */
function _buildClosureContainerFallback(container, recruitId) {
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('🔒✨ **募集締め切り済み** ✨🔒')
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('🔒 この募集は締め切られました。')
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`募集ID：\`${recruitId}\` | powered by **Recrubo**`)
  );
}

/**
 * 無効化されたボタンを構築
 */
function _buildDisabledButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('participate_disabled')
      .setLabel('参加する')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('cancel_disabled')
      .setLabel('取り消す')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

/**
 * リクルーターに完了を通知
 */
async function _notifyRecruiterOfClosure(message, recruiterId) {
  try {
    await message.reply({
      content: '🔒 自動締切: この募集は有効期限切れのため締め切りました。',
      allowedMentions: { roles: [], users: recruiterId ? [recruiterId] : [] }
    });
  } catch (e) {
    console.warn('[autoClose] Failed to notify recruiter:', e?.message || e);
  }
}

/**
 * 募集のキャッシュをクリーンアップ
 */
async function _cleanupRecruitmentCaches(messageId, recruitId, recruiterId) {
  try {
    const statusRes = await db.updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());
    if (!statusRes?.ok) {
      console.warn('[autoClose] Status update returned warning:', statusRes);
    }
  } catch (e) {
    console.warn('[autoClose] Failed to update status:', e?.message || e);
  }

  try {
    const deleteRes = await db.deleteRecruitmentData(messageId, recruiterId);
    if (!deleteRes?.ok && deleteRes?.status !== 404) {
      console.warn('[autoClose] Recruitment delete returned warning:', deleteRes);
    }
  } catch (e) {
    console.warn('[autoClose] Failed to delete recruitment:', e?.message || e);
  }

  try {
    await db.deleteParticipantsFromRedis(messageId);
  } catch (e) {
    console.warn('[autoClose] deleteParticipantsFromRedis failed:', e?.message || e);
  }

  try {
    if (recruitId) {
      await db.deleteRecruitFromRedis(recruitId);
    }
  } catch (e) {
    console.warn('[autoClose] deleteRecruitFromRedis failed:', e?.message || e);
  }
}

module.exports = {
  autoCloseRecruitment
};
