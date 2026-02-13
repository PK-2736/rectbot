const { AttachmentBuilder, MessageFlags } = require('discord.js');
const { buildContainer } = require('./recruitHelpers');
const db = require('./db');

function hydrateRecruitData(recruit) {
  if (!recruit || typeof recruit !== 'object') return recruit;
  try {
    if (!recruit.guildId && recruit.metadata?.guildId) recruit.guildId = recruit.metadata.guildId;
    if (!recruit.channelId && recruit.metadata?.channelId) recruit.channelId = recruit.metadata.channelId;
    if (!recruit.message_id && recruit.metadata?.messageId) recruit.message_id = recruit.metadata.messageId;
    if (!recruit.messageId && recruit.metadata?.messageId) recruit.messageId = recruit.metadata.messageId;
    if (!recruit.recruiterId && recruit.ownerId) recruit.recruiterId = recruit.ownerId;
    if (!recruit.ownerId && recruit.recruiterId) recruit.ownerId = recruit.recruiterId;
    if (!recruit.panelColor && recruit.metadata?.panelColor) recruit.panelColor = recruit.metadata.panelColor;
    if (!recruit.vc && recruit.metadata?.vc) recruit.vc = recruit.metadata.vc;
    if (!recruit.note && recruit.metadata?.note) recruit.note = recruit.metadata.note;
    if (!recruit.content && recruit.metadata?.raw?.content) recruit.content = recruit.metadata.raw.content;
    if (!recruit.title) {
      recruit.title = recruit.metadata?.raw?.title || recruit.metadata?.title || recruit.description || '募集';
    }
    if (!recruit.participants && Array.isArray(recruit.metadata?.raw?.participants)) {
      recruit.participants = recruit.metadata.raw.participants;
    }
  } catch (e) {
    console.warn('hydrateRecruitData failed:', e?.message || e);
  }
  return recruit;
}

async function updateParticipantList(interactionOrMessage, participants, savedRecruitData) {
  try {
    let interaction = null;
    let message = null;
    if (interactionOrMessage && interactionOrMessage.message) {
      interaction = interactionOrMessage;
      message = interaction.message;
    } else {
      message = interactionOrMessage;
    }
    const client = (interaction && interaction.client) || (message && message.client);
    const messageIdStr = message?.id ? String(message.id) : null;
    const recruitId = messageIdStr ? messageIdStr.slice(-8) : null;

    if (!savedRecruitData && recruitId) {
      try {
        const fromRedis = await db.getRecruitFromRedis(recruitId);
        if (fromRedis) savedRecruitData = fromRedis;
        else {
          const fromWorker = await db.getRecruitFromWorker(recruitId);
          if (fromWorker?.ok && fromWorker.body) {
            savedRecruitData = fromWorker.body;
            try { await db.saveRecruitToRedis(recruitId, savedRecruitData); } catch (_) {}
          }
        }
      } catch (e) {
        console.warn('updateParticipantList: fallback fetch failed:', e?.message || e);
      }
    }

    if (!savedRecruitData) {
      console.warn('updateParticipantList: savedRecruitData unavailable; persisting participants only');
      if (message && message.id) {
        try { await db.saveParticipantsToRedis(message.id, participants); } catch (_) {}
      }
      return;
    }

    savedRecruitData = hydrateRecruitData(savedRecruitData);
    if (recruitId) {
      try { await db.saveRecruitToRedis(recruitId, savedRecruitData); } catch (_) {}
    }

    const guildId = savedRecruitData?.guildId || (interaction && interaction.guildId) || (message && message.guildId);
    const guildSettings = await db.getGuildSettings(guildId);

    let useColor = savedRecruitData?.panelColor || guildSettings?.defaultColor || '000000';
    if (typeof useColor === 'string' && useColor.startsWith('#')) useColor = useColor.slice(1);
    if (!/^[0-9A-Fa-f]{6}$/.test(useColor)) useColor = '000000';

    const style = (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
    let updatedImage = null;
    if (style === 'image') {
      const { generateRecruitCard } = require('./canvasRecruit');
      const buffer = await generateRecruitCard(savedRecruitData, participants, client, useColor);
      updatedImage = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
    }

    // 参加リストテキスト（改行なし、残り人数表示）
    const totalSlots = savedRecruitData?.participants || savedRecruitData?.participant_count || 1;
    const remainingSlots = totalSlots - participants.length;
    let participantText = `📋 参加リスト (**あと${remainingSlots}人**)\n${participants.map(id => `<@${id}>`).join(' • ')}`;
    
    // 通知ロールを画像の上に表示
    let subHeaderText = null;
    try {
      // 保存された募集データから選択された通知ロールを取得
      const selectedNotificationRole = savedRecruitData?.notificationRoleId;
      
      if (selectedNotificationRole) {
        if (selectedNotificationRole === 'everyone') {
          subHeaderText = '🔔 通知ロール: @everyone';
        } else if (selectedNotificationRole === 'here') {
          subHeaderText = '🔔 通知ロール: @here';
        } else {
          subHeaderText = `🔔 通知ロール: <@&${selectedNotificationRole}>`;
        }
      }
    } catch (e) {
      console.warn('updateParticipantList: failed to build notification role text:', e?.message || e);
    }

    // ヘッダーは常に「〜さんの募集」を表示（simpleでも維持）
    let headerTitle = savedRecruitData?.title || '募集';
    try {
      if (savedRecruitData && savedRecruitData.recruiterId && client) {
        const user = await client.users.fetch(savedRecruitData.recruiterId).catch(() => null);
        if (user && (user.username || user.displayName || user.tag)) {
          const name = user.username || user.displayName || user.tag;
          headerTitle = `${name}さんの募集`;
        }
      }
    } catch (e) { console.warn('updateParticipantList: failed to fetch recruiter user:', e?.message || e); }
    // アバターURLの取得
    let avatarUrl = null;
    try {
      if (savedRecruitData && savedRecruitData.recruiterId && client) {
        const user = await client.users.fetch(savedRecruitData.recruiterId).catch(() => null);
        if (user && typeof user.displayAvatarURL === 'function') {
          avatarUrl = user.displayAvatarURL({ size: 64, extension: 'png' });
        }
      }
    } catch (e) { console.warn('updateParticipantList: failed to resolve avatar url:', e?.message || e); }

    const accentColor = parseInt(useColor, 16);
    const recruiterId = savedRecruitData?.recruiterId || null;
    const requesterId = interaction ? interaction.user?.id : null;
    const recruitIdText = savedRecruitData?.recruitId || (savedRecruitData?.message_id ? savedRecruitData.message_id.slice(-8) : (messageIdStr ? messageIdStr.slice(-8) : '(unknown)'));
    const actualRecruitId = recruitId || (recruitIdText && recruitIdText !== '(unknown)' ? recruitIdText : null);

    // 今から + 設定有効時は専用チャンネルボタンを再付与
    const extraActionButtons = [];
    try {
      const { ButtonBuilder, ButtonStyle } = require('discord.js');
      const enableDedicated = Boolean(guildSettings?.enable_dedicated_channel);
      const isNowStart = String(savedRecruitData?.startTime || '').trim() === '今から';
      if (enableDedicated && isNowStart && actualRecruitId) {
        extraActionButtons.push(
          new ButtonBuilder()
            .setCustomId(`create_vc_${actualRecruitId}`)
            .setLabel('専用チャンネル作成')
            .setEmoji('📢')
            .setStyle(ButtonStyle.Primary)
        );
      }
    } catch (e) {
      console.warn('updateParticipantList: failed to build extraActionButtons:', e?.message || e);
    }
    let updatedContainer;
    if (style === 'simple') {
      const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
      const startVal = savedRecruitData?.startTime ? String(savedRecruitData.startTime) : null;
      const membersVal = typeof (savedRecruitData?.participants || savedRecruitData?.participant_count) === 'number'
        ? `${(savedRecruitData.participants || savedRecruitData.participant_count)}人`
        : null;
      let voiceVal = null;
      if (typeof savedRecruitData?.vc === 'string') {
        if (savedRecruitData.vc === 'あり(聞き専)') {
          voiceVal = savedRecruitData?.voicePlace ? `聞き専/${savedRecruitData.voicePlace}` : '聞き専';
        } else if (savedRecruitData.vc === 'あり') {
          voiceVal = savedRecruitData?.voicePlace ? `あり/${savedRecruitData.voicePlace}` : 'あり';
        } else if (savedRecruitData.vc === 'なし') {
          voiceVal = 'なし';
        }
      } else if (savedRecruitData?.voice === true) {
        voiceVal = savedRecruitData?.voicePlace ? `あり/${savedRecruitData.voicePlace}` : 'あり';
      } else if (savedRecruitData?.voice === false) {
        voiceVal = 'なし';
      }
      const valuesLine = [startVal, membersVal, voiceVal].filter(Boolean).join(' | ');
      const details = [labelsLine, valuesLine].filter(Boolean).join('\n');
      // 募集内容を取得（noteまたはcontentフィールド）
      const contentTextValue = savedRecruitData?.note || savedRecruitData?.content || '';
      const contentText = contentTextValue && String(contentTextValue).trim().length > 0 
        ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}` 
        : '';
      const { buildContainerSimple } = require('./recruitHelpers');
      updatedContainer = buildContainerSimple({
        headerTitle,
        detailsText: details,
        contentText,
        // simpleでは最上部にMarkdown見出し(##)で表示
        titleText: (savedRecruitData?.title ? `## ${String(savedRecruitData.title).slice(0,200)}` : ''),
        participantText,
        recruitIdText,
        accentColor,
        subHeaderText,
        avatarUrl,
        extraActionButtons
      });
    } else {
      const { buildContainer } = require('./recruitHelpers');
      // 募集内容を取得（noteまたはcontentフィールド）
      const contentText = savedRecruitData?.note || savedRecruitData?.content || '';
      updatedContainer = buildContainer({ 
        headerTitle, 
        contentText,
        titleText: (savedRecruitData?.title ? `📌 タイトル\n${String(savedRecruitData.title).slice(0,200)}` : ''),
        participantText, 
        recruitIdText, 
        accentColor, 
        imageAttachmentName: 'attachment://recruit-card.png', 
        recruiterId, 
        requesterId,
        subHeaderText,
        avatarUrl,
        extraActionButtons
      });
    }

    if (message && message.edit) {
      const editPayload = { components: [updatedContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } };
      if (style === 'image' && updatedImage) {
        editPayload.files = [updatedImage];
      }
      await message.edit(editPayload);
    }

    if (message && message.id) {
      await db.saveParticipantsToRedis(message.id, participants);
    }
  } catch (err) {
    console.error('updateParticipantList error:', err);
  }
}

async function autoCloseRecruitment(client, guildId, channelId, messageId) {
  console.log('[autoClose] Triggered for message:', messageId, 'guild:', guildId, 'channel:', channelId);
  try {
    if (!client) throw new Error('client unavailable');

    const recruitId = String(messageId).slice(-8);
    
    // 募集情報を先に取得（メッセージの有無に関わらず）
    let savedRecruitData = null;
    try { savedRecruitData = await db.getRecruitFromRedis(recruitId); } catch (e) { console.warn('[autoClose] getRecruitFromRedis failed:', e?.message || e); }
    if (!savedRecruitData) {
      const workerRes = await db.getRecruitFromWorker(recruitId);
      if (workerRes?.ok) savedRecruitData = workerRes.body;
    }
    if (savedRecruitData) savedRecruitData = hydrateRecruitData(savedRecruitData);

    const recruiterId = savedRecruitData?.recruiterId || savedRecruitData?.ownerId || null;

    // メッセージの取得を試みる
    const channel = await client.channels.fetch(channelId).catch(() => null);
    let message = null;
    if (channel) {
      message = await channel.messages.fetch(messageId).catch(() => null);
    }

    // メッセージが存在する場合のみメッセージを編集・返信
    if (message) {
      try {
        const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
        const { generateClosedRecruitCard } = require('./canvasRecruit');
        
        const baseColor = (() => {
          const src = (savedRecruitData && savedRecruitData.panelColor) || '808080';
          const cleaned = typeof src === 'string' && src.startsWith('#') ? src.slice(1) : src;
          return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : 0x808080;
        })();

        // 元の画像を取得
        const originalAttachment = message.attachments.first();
        let closedAttachment = null;

        if (originalAttachment && originalAttachment.url) {
          try {
            // 元の画像をダウンロード
            const response = await fetch(originalAttachment.url);
            const arrayBuffer = await response.arrayBuffer();
            const originalImageBuffer = Buffer.from(arrayBuffer);
            
            // 締め切り画像を生成（灰色化 + CLOSED オーバーレイ）
            const closedImageBuffer = await generateClosedRecruitCard(originalImageBuffer);
            closedAttachment = new AttachmentBuilder(closedImageBuffer, { name: 'recruit-card-closed.png' });
          } catch (imgErr) {
            console.warn('[autoClose] Failed to generate closed image:', imgErr);
          }
        }

        // ContainerBuilder で締め切り状態を構築
        const disabledContainer = new ContainerBuilder();
        disabledContainer.setAccentColor(baseColor);
        
        // ヘッダー
        disabledContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent('🔒✨ **募集締め切り済み** ✨🔒')
        );
        disabledContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        
        // 画像を表示
        disabledContainer.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://recruit-card-closed.png')
          )
        );
        
        disabledContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        
        // 締め切り状態メッセージ
        disabledContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent('🔒 この募集は締め切られました。')
        );
        disabledContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        
        // フッター
        disabledContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`募集ID：\`${recruitId}\` | powered by **Recrubo**`)
        );

        // 無効化されたボタンを追加
        const disabledButtons = new ActionRowBuilder()
          .addComponents(
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

        // メッセージ編集ペイロード
        const editPayload = {
          components: [disabledContainer, disabledButtons],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { roles: [], users: [] }
        };

        // 締め切り画像ファイルを添付
        if (closedAttachment) {
          editPayload.files = [closedAttachment];
        }

        await message.edit(editPayload);
      } catch (e) { console.warn('[autoClose] Failed to edit message during auto close:', e?.message || e); }

      try { await message.reply({ content: `🔒 自動締切: この募集は有効期限切れのため締め切りました。`, allowedMentions: { roles: [], users: recruiterId ? [recruiterId] : [] } }).catch(() => null); } catch (_) {}
    } else {
      console.warn('[autoClose] Message not found (manual deletion or already deleted):', messageId);
      // メッセージが存在しない場合はログするが、キャッシュは削除する
    }

    // ✅ メッセージの有無に関わらずStauts更新・キャッシュ削除を実行
    try { const statusRes = await db.updateRecruitmentStatus(messageId, 'ended', new Date().toISOString()); if (!statusRes?.ok) console.warn('[autoClose] Status update returned warning:', statusRes); } catch (e) { console.warn('[autoClose] Failed to update status:', e?.message || e); }
    try { const deleteRes = await db.deleteRecruitmentData(messageId, recruiterId); if (!deleteRes?.ok && deleteRes?.status !== 404) console.warn('[autoClose] Recruitment delete returned warning:', deleteRes); } catch (e) { console.warn('[autoClose] Failed to delete recruitment from Durable Object:', e?.message || e); }
    try { await db.deleteParticipantsFromRedis(messageId); } catch (e) { console.warn('[autoClose] deleteParticipantsFromRedis failed:', e?.message || e); }
    try { if (recruitId) await db.deleteRecruitFromRedis(recruitId); } catch (e) { console.warn('[autoClose] deleteRecruitFromRedis failed:', e?.message || e); }

    console.log('[autoClose] Completed for message:', messageId, '- All caches cleared regardless of message existence');
  } catch (error) {
    console.error('[autoClose] Unexpected error:', error);
  }
}

module.exports = { updateParticipantList, autoCloseRecruitment };
