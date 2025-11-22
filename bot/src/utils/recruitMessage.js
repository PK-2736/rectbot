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

    const { generateRecruitCard } = require('./canvasRecruit');
    const buffer = await generateRecruitCard(savedRecruitData, participants, client, useColor);
    const updatedImage = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });

    // 参加リストテキスト（改行なし、残り人数表示）
    const totalSlots = savedRecruitData?.participants || savedRecruitData?.participant_count || 1;
    const remainingSlots = totalSlots - participants.length;
    let participantText = `🎯✨ 参加リスト (あと${remainingSlots}人) ✨🎯\n${participants.map(id => `<@${id}>`).join(' ')}`;
    
    // 通知ロールを画像の上に表示
    let notificationText = '';
    try {
      const rid = savedRecruitData && (savedRecruitData.notificationRoleId || savedRecruitData.notification_role_id || savedRecruitData.notification_role);
      const notifRoleId = rid ? String(rid) : null;
      if (notifRoleId) {
        notificationText = `🔔 通知ロール: <@&${notifRoleId}>\n\n`;
      }
    } catch (_) {}
    
    const fullText = notificationText + participantText;

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

    const accentColor = parseInt(useColor, 16);
    const recruiterId = savedRecruitData?.recruiterId || null;
    const requesterId = interaction ? interaction.user?.id : null;
    const updatedContainer = buildContainer({ headerTitle, participantText: fullText, recruitIdText: savedRecruitData?.recruitId || (savedRecruitData?.message_id ? savedRecruitData.message_id.slice(-8) : '(unknown)'), accentColor, imageAttachmentName: 'attachment://recruit-card.png', recruiterId, requesterId });

    if (message && message.edit) {
      await message.edit({ files: [updatedImage], components: [updatedContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } });
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

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) { console.warn('[autoClose] Channel not found:', channelId); return; }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) { console.warn('[autoClose] Message not found for auto close:', messageId); return; }

    const recruitId = String(messageId).slice(-8);
    let savedRecruitData = null;
    try { savedRecruitData = await db.getRecruitFromRedis(recruitId); } catch (e) { console.warn('[autoClose] getRecruitFromRedis failed:', e?.message || e); }
    if (!savedRecruitData) {
      const workerRes = await db.getRecruitFromWorker(recruitId);
      if (workerRes?.ok) savedRecruitData = workerRes.body;
    }
    if (savedRecruitData) savedRecruitData = hydrateRecruitData(savedRecruitData);

    let participants = [];
    try { const persisted = await db.getParticipantsFromRedis(messageId); if (Array.isArray(persisted)) participants = persisted; } catch (e) { console.warn('[autoClose] getParticipantsFromRedis failed:', e?.message || e); }

    const recruiterId = savedRecruitData?.recruiterId || savedRecruitData?.ownerId || null;

    try { const statusRes = await db.updateRecruitmentStatus(messageId, 'ended', new Date().toISOString()); if (!statusRes?.ok) console.warn('[autoClose] Status update returned warning:', statusRes); } catch (e) { console.warn('[autoClose] Failed to update status:', e?.message || e); }
    try { const deleteRes = await db.deleteRecruitmentData(messageId, recruiterId); if (!deleteRes?.ok && deleteRes?.status !== 404) console.warn('[autoClose] Recruitment delete returned warning:', deleteRes); } catch (e) { console.warn('[autoClose] Failed to delete recruitment from Durable Object:', e?.message || e); }

    try {
      const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
      const disabledContainer = new ContainerBuilder();
      const baseColor = (() => {
        const src = (savedRecruitData && savedRecruitData.panelColor) || '808080';
        const cleaned = typeof src === 'string' && src.startsWith('#') ? src.slice(1) : src;
        return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : 0x808080;
      })();
      disabledContainer.setAccentColor(baseColor);
      disabledContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('🎮✨ **募集締め切り済み** ✨🎮'));
      disabledContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      const attachmentUrl = message.attachments.first()?.url || 'attachment://recruit-card.png';
      disabledContainer.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(attachmentUrl)));
      disabledContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      disabledContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('🔒 この募集は自動的に締め切られました。'));
      disabledContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      disabledContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`募集ID：\`${recruitId}\` | powered by **rectbot**`));
      await message.edit({ components: [disabledContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } });
    } catch (e) { console.warn('[autoClose] Failed to edit message during auto close:', e?.message || e); }

    try { await message.reply({ content: `🔒 自動締切: この募集は有効期限切れのため締め切りました。`, allowedMentions: { roles: [], users: recruiterId ? [recruiterId] : [] } }).catch(() => null); } catch (_) {}

    try { await db.deleteParticipantsFromRedis(messageId); } catch (e) { console.warn('[autoClose] deleteParticipantsFromRedis failed:', e?.message || e); }
    try { if (recruitId) await db.deleteRecruitFromRedis(recruitId); } catch (e) { console.warn('[autoClose] deleteRecruitFromRedis failed:', e?.message || e); }

    console.log('[autoClose] Completed for message:', messageId);
  } catch (error) {
    console.error('[autoClose] Unexpected error:', error);
  }
}

module.exports = { updateParticipantList, autoCloseRecruitment };
