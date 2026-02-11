const { EmbedBuilder } = require('discord.js');
const { recruitParticipants } = require('./state');
const { createErrorEmbed } = require('../../utils/embedHelpers');
const { getParticipantsFromRedis, getRecruitFromRedis, listRecruitsFromRedis, saveParticipantsToRedis } = require('../../utils/db');
const { updateParticipantList } = require('../../utils/recruitMessage');
const { runInBackground } = require('./handlerUtils');
const { replyEphemeral, logError } = require('./reply-helpers');
const { isRecruiter } = require('./validation-helpers');
const { hexToIntColor } = require('./ui-builders');

async function sendRecruiterMessage(interaction, savedRecruitData, payload) {
  if (!savedRecruitData?.recruiterId) return;

  const recruiterUser = await interaction.client.users.fetch(savedRecruitData.recruiterId).catch(() => null);
  if (recruiterUser && recruiterUser.send) {
    await recruiterUser.send(payload).catch(() => null);
  }
}

async function hydrateParticipants(_interaction, messageId) {
  let participants = recruitParticipants.get(messageId) || [];
  try {
    const persisted = await getParticipantsFromRedis(messageId);
    if (Array.isArray(persisted) && persisted.length > 0) {
      if (!participants || participants.length === 0) {
        participants = persisted;
        recruitParticipants.set(messageId, participants);
      }
    }
  } catch (e) {
    console.warn('参加者リスト復元に失敗:', e?.message || e);
  }
  return participants;
}

async function loadSavedRecruitData(_interaction, messageId) {
  let savedRecruitData = null;
  try {
    const recruitId = String(messageId).slice(-8);
    savedRecruitData = await getRecruitFromRedis(recruitId);
    if (!savedRecruitData) {
      try {
        const all = await listRecruitsFromRedis();
        savedRecruitData = all.find(r => r && (r.message_id === messageId || r.messageId === messageId || r.recruitId === recruitId));
      } catch (e) {
        console.warn('listRecruitsFromRedis fallback failed:', e?.message || e);
      }
    }
  } catch (e) {
    console.warn('getRecruitFromRedis failed:', e?.message || e);
    savedRecruitData = null;
  }
  return savedRecruitData;
}

async function sendJoinNotificationToChannel(interaction, messageId, savedRecruitData) {
  if (!savedRecruitData?.recruiterId || !savedRecruitData?.channelId) return;

  runInBackground(async () => {
    const { getDedicatedChannel } = require('../../utils/db/dedicatedChannels');
    const recruitId = savedRecruitData.recruitId || messageId.slice(-8);
    const dedicatedChannelId = await getDedicatedChannel(recruitId).catch(() => null);

    const channel = await interaction.client.channels.fetch(savedRecruitData.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    let notificationContent = `🎉 <@${interaction.user.id}> が参加しました！`;
    if (dedicatedChannelId) {
      notificationContent += `\n🔗 専用チャンネル: <#${dedicatedChannelId}>`;
    }

    const notificationMsg = await channel.send({
      content: notificationContent,
      allowedMentions: { users: [] }
    });

    setTimeout(() => {
      notificationMsg.delete().catch(() => null);
    }, 5 * 60 * 1000);
  }, 'Join notification to channel');
}

async function notifyRecruiterOfJoin(interaction, participants, savedRecruitData) {
  if (!savedRecruitData?.recruiterId) return;

  runInBackground(async () => {
    const joinColor = hexToIntColor(savedRecruitData?.panelColor || '00FF00', 0x00FF00);
    const joinEmbed = new EmbedBuilder()
      .setColor(joinColor)
      .setTitle('🎮 新しい参加者がいます！')
      .setDescription(`<@${interaction.user.id}> が募集に参加しました！`)
      .addFields(
        { name: '募集タイトル', value: savedRecruitData.title, inline: false },
        { name: '現在の参加者数', value: `${participants.length}/${savedRecruitData.participants}人`, inline: true }
      )
      .setTimestamp();

    await sendRecruiterMessage(interaction, savedRecruitData, {
      content: `あなたの募集に参加者が増えました: ${savedRecruitData.title || ''}`,
      embeds: [joinEmbed]
    });
  }, 'Recruiter DM notification');
}

async function processJoin(interaction, messageId, participants, savedRecruitData) {
  if (participants.includes(interaction.user.id)) {
    await replyEphemeral(interaction, {
      embeds: [createErrorEmbed('既に参加済みです。')]
    });
    return;
  }

  participants.push(interaction.user.id);
  recruitParticipants.set(messageId, participants);
  saveParticipantsToRedis(messageId, participants).catch(e =>
    logError('参加者保存失敗 (async)', e)
  );

  try {
    await replyEphemeral(interaction, {
      content: '✅ 参加しました！'
    });
  } catch (e) {
    logError('quick reply failed', e);
  }

  await sendJoinNotificationToChannel(interaction, messageId, savedRecruitData);
  await notifyRecruiterOfJoin(interaction, participants, savedRecruitData);

  updateParticipantList(interaction, participants, savedRecruitData).catch(e =>
    logError('updateParticipantList failed (async)', e)
  );
}

async function sendCancelNotificationToRecruiter(interaction, savedRecruitData, updated) {
  try {
    const cancelColor = hexToIntColor(savedRecruitData?.panelColor || 'FF6B35', 0xFF6B35);
    const cancelEmbed = new EmbedBuilder()
      .setColor(cancelColor)
      .setTitle('📤 参加者がキャンセルしました')
      .setDescription(`<@${interaction.user.id}> が募集から離脱しました。`)
      .addFields(
        { name: '募集タイトル', value: savedRecruitData.title, inline: false },
        { name: '現在の参加者数', value: `${updated.length}/${savedRecruitData.participants}人`, inline: true }
      )
      .setTimestamp();
    await sendRecruiterMessage(interaction, savedRecruitData, {
      content: `あなたの募集から参加者が離脱しました: ${savedRecruitData.title || ''}`,
      embeds: [cancelEmbed]
    });
  } catch (e) {
    logError('background cancel notify failed', e);
  }
}

async function processCancel(interaction, messageId, participants, savedRecruitData) {
  const beforeLength = participants.length;

  if (isRecruiter(interaction.user.id, savedRecruitData)) {
    await replyEphemeral(interaction, {
      embeds: [createErrorEmbed('募集主は参加をキャンセルできません。\n募集を締める場合は「締め」ボタンを使用してください。')]
    });
    return participants;
  }

  const updated = participants.filter(id => id !== interaction.user.id);

  if (beforeLength > updated.length) {
    recruitParticipants.set(messageId, updated);
    saveParticipantsToRedis(messageId, updated).catch(e => logError('参加者保存失敗 (async)', e));

    try {
      await replyEphemeral(interaction, {
        content: '✅ 参加を取り消しました。'
      });
    } catch (e) {
      logError('quick cancel reply failed', e);
    }

    if (savedRecruitData && savedRecruitData.recruiterId) {
      runInBackground(() => sendCancelNotificationToRecruiter(interaction, savedRecruitData, updated), 'Cancel notification');
    }
  } else {
    await replyEphemeral(interaction, {
      embeds: [createErrorEmbed('参加していないため、取り消せません。')]
    });
  }

  updateParticipantList(interaction, updated, savedRecruitData).catch(e =>
    logError('updateParticipantList failed (async)', e)
  );

  return updated;
}

module.exports = {
  hydrateParticipants,
  loadSavedRecruitData,
  processJoin,
  processCancel
};
