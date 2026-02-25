const { EmbedBuilder } = require('discord.js');
const { 
  saveRecruitDataToRedis, 
  saveRecruitIntoWebhook, 
  saveAllParticipants, 
  saveParticipantsOnce 
} = require('../../../utils/database');

function shouldSaveRecruitData(recruitData) {
  if (!recruitData?.guildId || !recruitData?.channelId || !recruitData?.messageId) return false;
  if (!recruitData?.recruiterUserId && !recruitData?.metadata?.recruiterUserId) return false;
  return true;
}

async function initializeAndPersistData(interaction, recruitData) {
  if (shouldSaveRecruitData(recruitData)) {
    const metaFinal = {
      ...recruitData.metadata,
      participants: recruitData.participants,
      recruitNum: recruitData.participants.length
    };
    const augmentedRecruit = { ...recruitData, metadata: metaFinal };

    try {
      await Promise.all([
        saveRecruitDataToRedis(augmentedRecruit),
        saveRecruitIntoWebhook(augmentedRecruit),
        saveAllParticipants(augmentedRecruit),
        saveParticipantsOnce({
          ...augmentedRecruit,
          participants: [{ ...augmentedRecruit.participants[0] }]
        })
      ]);
      console.log(`[DATA_PERSIST] Saved recruitId=${recruitData.messageId} to Redis+Webhook+Participants`);
    } catch (error) {
      console.error('[DATA_PERSIST_ERROR]', error);
    }
  } else {
    console.warn('[SKIP_DATA_PERSIST] recruitData invalid or incomplete', {
      hasGuild: !!recruitData?.guildId,
      hasChannel: !!recruitData?.channelId,
      hasMessage: !!recruitData?.messageId,
      hasRecruiter: !!(recruitData?.recruiterUserId || recruitData?.metadata?.recruiterUserId)
    });
  }
}

async function sendWebhookNotification(webhookUrl, recruitData) {
  if (!webhookUrl) return;

  const embed = new EmbedBuilder()
    .setTitle('📢 新規募集作成')
    .setDescription(recruitData.metadata?.title || 'タイトルなし')
    .addFields(
      { name: 'ゲーム', value: recruitData.metadata?.game || 'なし', inline: true },
      { name: '募集人数', value: String(recruitData.metadata?.participantsNum || 0), inline: true },
      { name: 'VC', value: recruitData.metadata?.voice || 'なし', inline: true }
    )
    .setColor(0x5865f2)
    .setTimestamp();

  const payload = {
    embeds: [embed.toJSON()],
    username: 'Recrubo',
    avatar_url: 'https://cdn.discordapp.com/attachments/1234567890/recrubo_avatar.png'
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      console.error(`[WEBHOOK_ERROR] Status ${response.status}: ${await response.text()}`);
    }
  } catch (error) {
    console.error('[WEBHOOK_ERROR]', error);
  }
}

module.exports = {
  shouldSaveRecruitData,
  initializeAndPersistData,
  sendWebhookNotification
};
