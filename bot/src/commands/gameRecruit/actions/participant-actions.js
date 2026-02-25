const { EmbedBuilder } = require('discord.js');
const { recruitParticipants } = require('../data/state');
const { createErrorEmbed } = require('../../../utils/embedHelpers');
const { getParticipantsFromRedis, getRecruitFromRedis, listRecruitsFromRedis, saveParticipantsToRedis } = require('../utils/database');
const { updateParticipantList } = require('../../../utils/recruitMessage');
const { runInBackground } = require('../utils/handlerUtils');
const { replyEphemeral, logError } = require('../utils/reply-helpers');
const { isRecruiter } = require('../validation/validation-helpers');
const { hexToIntColor } = require('../ui/ui-builders');

async function saveAndUpdateParticipants(interaction, messageId, participants, savedRecruitData) {
  recruitParticipants.set(messageId, participants);
  saveParticipantsToRedis(messageId, participants).catch(e =>
    logError('参加者保存失敗 (async)', e)
  );
  updateParticipantList(interaction, participants, savedRecruitData).catch(e =>
    logError('updateParticipantList failed (async)', e)
  );
}

async function notifyRecruiter(interaction, savedRecruitData, embedOptions) {
  if (!savedRecruitData?.recruiterId) return;

  runInBackground(async () => {
    const color = hexToIntColor(savedRecruitData?.panelColor || embedOptions.defaultColor, embedOptions.defaultColorInt);
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(embedOptions.title)
      .setDescription(embedOptions.description)
      .addFields(
        { name: '募集タイトル', value: savedRecruitData.title, inline: false },
        { name: '現在の参加者数', value: embedOptions.participantCount, inline: true }
      )
      .setTimestamp();

    await sendRecruiterMessage(interaction, savedRecruitData, {
      content: embedOptions.content,
      embeds: [embed]
    });
  }, embedOptions.backgroundTaskName);
}

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

function createJoinNotificationOptions(userId, participants, savedRecruitData) {
  return {
    defaultColor: '00FF00',
    defaultColorInt: 0x00FF00,
    title: '🎮 新しい参加者がいます！',
    description: `<@${userId}> が募集に参加しました！`,
    participantCount: `${participants.length}/${savedRecruitData.participants}人`,
    content: `あなたの募集に参加者が増えました: ${savedRecruitData.title || ''}`,
    backgroundTaskName: 'Recruiter DM notification'
  };
}

function createCancelNotificationOptions(userId, participants, savedRecruitData) {
  return {
    defaultColor: 'FF6B35',
    defaultColorInt: 0xFF6B35,
    title: '📤 参加者がキャンセルしました',
    description: `<@${userId}> が募集から離脱しました。`,
    participantCount: `${participants.length}/${savedRecruitData.participants}人`,
    content: `あなたの募集から参加者が離脱しました: ${savedRecruitData.title || ''}`,
    backgroundTaskName: 'Cancel notification'
  };
}

async function sendJoinNotificationToChannel(interaction, messageId, savedRecruitData) {
  if (!savedRecruitData?.recruiterId || !savedRecruitData?.channelId) return;

  runInBackground(async () => {
    const { getDedicatedChannel } = require('../../../utils/db/dedicatedChannels');
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

async function processJoin(interaction, messageId, participants, savedRecruitData) {
  if (participants.includes(interaction.user.id)) {
    await replyEphemeral(interaction, {
      embeds: [createErrorEmbed('既に参加済みです。')]
    });
    return;
  }

  participants.push(interaction.user.id);

  try {
    await replyEphemeral(interaction, {
      content: '✅ 参加しました！'
    });
  } catch (e) {
    logError('quick reply failed', e);
  }

  await sendJoinNotificationToChannel(interaction, messageId, savedRecruitData);
  await notifyRecruiter(interaction, savedRecruitData, createJoinNotificationOptions(interaction.user.id, participants, savedRecruitData));
  await saveAndUpdateParticipants(interaction, messageId, participants, savedRecruitData);
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
    try {
      await replyEphemeral(interaction, {
        content: '✅ 参加を取り消しました。'
      });
    } catch (e) {
      logError('quick cancel reply failed', e);
    }

    await notifyRecruiter(interaction, savedRecruitData, createCancelNotificationOptions(interaction.user.id, updated, savedRecruitData));
    await saveAndUpdateParticipants(interaction, messageId, updated, savedRecruitData);
  } else {
    await replyEphemeral(interaction, {
      embeds: [createErrorEmbed('参加していないため、取り消せません。')]
    });
  }

  return updated;
}

module.exports = {
  hydrateParticipants,
  loadSavedRecruitData,
  processJoin,
  processCancel
};
