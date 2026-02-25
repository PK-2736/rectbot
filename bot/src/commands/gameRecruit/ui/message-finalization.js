/**
 * メッセージ確定モジュール
 * 募集メッセージの最終的な編集と確定処理
 */

const { MessageFlags } = require('discord.js');
const { buildSimpleContainerForCreate, buildImageContainerForCreate } = require('../ui/ui-preparation');

/**
 * メッセージとUIを確定（メイン/セカンダリ両方）
 */
async function finalizeMessageAndUIFlow(interaction, followUpMessage, secondaryMessage, options) {
  const { recruitDataObj, _guildSettings, container, image, participantText, subHeaderText, accentColor, style, _useColor, user } = options;
  
  const recruitId = followUpMessage.id.slice(-8);
  
  try {
    // 画像が実際に利用可能か確認
    const hasImage = image && style === 'image';
    
    // RecruitIDを含む最終コンテナを構築
    // 画像なしまたはStypeがsimpleの場合は常にシンプルコンテナを使用
    const immediateContainer = !hasImage
      ? await buildSimpleContainerForCreate(recruitDataObj, interaction, user, participantText, subHeaderText, accentColor, recruitId)
      : buildImageContainerForCreate(recruitDataObj, interaction, participantText, subHeaderText, accentColor, recruitId);

    const editPayload = {
      components: [immediateContainer],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { roles: [], users: [] }
    };
    
    // Pending button（専用チャンネル作成ボタン等）を追加
    if (container.__addPendingButton && container.__pendingButtonRow) {
      editPayload.components.push(container.__pendingButtonRow);
    }
    
    // 実際に画像がある場合のみ添付
    if (hasImage) {
      editPayload.files = [image];
    }

    // メインメッセージを編集
    await followUpMessage.edit(editPayload);
    
    // セカンダリメッセージも編集
    if (secondaryMessage?.id) {
      const secondaryPayload = { ...editPayload };
      secondaryPayload.components = [immediateContainer];
      if (container.__addPendingButton && container.__pendingButtonRow) {
        secondaryPayload.components.push(container.__pendingButtonRow);
      }
      await secondaryMessage.edit(secondaryPayload);
    }
  } catch (e) {
    console.warn('[finalizeMessageAndUIFlow] Initial message edit failed:', e?.message || e);
  }
}

module.exports = {
  finalizeMessageAndUIFlow
};
