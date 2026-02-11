const { buildStartTimeNotificationEmbed, buildStartTimeNotificationComponents } = require('./ui-builders');
const { isValidStartDelay, isImmediateStartTime, hasValidParticipants } = require('./validation-helpers');
const { getParticipantsFromRedis } = require('../../utils/db');
const { recruitParticipants } = require('./state');
const { logError } = require('./reply-helpers');

function computeDelayMs(targetTime, now = null) {
  if (!targetTime) return null;
  const target = new Date(targetTime).getTime();
  const current = now ? new Date(now).getTime() : Date.now();
  return target - current;
}

const startNotifySent = new Set();

async function sendStartTimeNotification(context) {
  const { finalRecruitData, interaction, actualMessageId, actualRecruitId, ids } = context;

  const mentions = ids.map(id => `<@${id}>`).join(' ');
  const embed = buildStartTimeNotificationEmbed({
    finalRecruitData,
    mentions,
    interaction,
    actualMessageId
  });
  const components = buildStartTimeNotificationComponents({
    guildSettings: context.guildSettings,
    actualRecruitId
  });

  const sendOptions = {
    content: mentions,
    embeds: [embed],
    components,
    allowedMentions: { users: ids }
  };

  await interaction.channel.send(sendOptions).catch(() => {});
}

async function tryGetParticipants(actualMessageId) {
  const fromRedis = await getParticipantsFromRedis(actualMessageId).catch(() => null);
  if (fromRedis) return fromRedis;

  const fromMemory = recruitParticipants.get(actualMessageId);
  if (fromMemory) return fromMemory;

  return [];
}

function scheduleStartTimeNotification(finalRecruitData, interaction, actualMessageId, actualRecruitId, guildSettings) {
  if (isImmediateStartTime(finalRecruitData.startTime)) return;

  const startDelay = computeDelayMs(finalRecruitData.startAt, null);
  if (!isValidStartDelay(startDelay)) return;

  setTimeout(async () => {
    try {
      if (startNotifySent.has(actualRecruitId)) return;
      startNotifySent.add(actualRecruitId);

      if (!recruitParticipants.has(actualMessageId)) return;

      const ids = await tryGetParticipants(actualMessageId);
      if (!hasValidParticipants(ids)) return;

      await sendStartTimeNotification({
        finalRecruitData,
        interaction,
        actualMessageId,
        actualRecruitId,
        ids,
        guildSettings
      });
    } catch (e) {
      logError('開始通知送信失敗', e);
    }
  }, startDelay);
}

module.exports = {
  scheduleStartTimeNotification
};
