const { MessageFlags } = require('discord.js');
const { sendNotificationAsync, runInBackground } = require('./handlerUtils');
const { logError, logCriticalError } = require('./reply-helpers');
const { shouldUseDefaultNotification: shouldUseDefaultNotif, isDifferentChannel } = require('./validation-helpers');

function buildConfiguredNotificationRoleIds(guildSettings) {
  const roles = [];
  if (Array.isArray(guildSettings.notification_roles)) roles.push(...guildSettings.notification_roles.filter(Boolean));
  if (guildSettings.notification_role) roles.push(guildSettings.notification_role);
  return [...new Set(roles.map(String))].slice(0, 25);
}

async function sendChannelNotification(channel, notificationRole, shouldUseDefaultNotification, logContext) {
  const roleToUse = notificationRole || (shouldUseDefaultNotification ? '1416797165769986161' : null);
  if (roleToUse) {
    runInBackground(
      () => sendNotificationAsync(channel, roleToUse, '新しい募集が作成されました。', logContext),
      `通知送信 ${logContext}`
    );
  }
}

async function postRecruitmentMessage(channel, container, image, extraComponents) {
  const options = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: [] }
  };

  if (image) options.files = [image];
  if (Array.isArray(extraComponents) && extraComponents.length > 0) {
    options.components.push(...extraComponents);
  }

  return await channel.send(options);
}

async function sendAnnouncements({ interaction, selectedNotificationRole, configuredIds, image, container, guildSettings, extraComponents = [] }) {
  const shouldUseDefaultNotification = shouldUseDefaultNotif(selectedNotificationRole, configuredIds);

  await sendChannelNotification(
    interaction.channel,
    selectedNotificationRole,
    shouldUseDefaultNotification,
    '(primary channel)'
  );

  const followUpMessage = await postRecruitmentMessage(
    interaction.channel,
    container,
    image,
    extraComponents
  );
  let secondaryMessage = null;

  const primaryRecruitChannelId = Array.isArray(guildSettings.recruit_channels) && guildSettings.recruit_channels.length > 0
    ? guildSettings.recruit_channels[0]
    : guildSettings.recruit_channel;

  if (isDifferentChannel(primaryRecruitChannelId, interaction.channelId)) {
    try {
      const recruitChannel = await interaction.guild.channels.fetch(primaryRecruitChannelId);
      if (recruitChannel && recruitChannel.isTextBased()) {
        await sendChannelNotification(
          recruitChannel,
          selectedNotificationRole,
          shouldUseDefaultNotification,
          '(recruit channel)'
        );

        try {
          secondaryMessage = await postRecruitmentMessage(
            recruitChannel,
            container,
            image,
            extraComponents
          );
        } catch (e) {
          logError('募集メッセージ送信失敗(指定ch)', e);
        }
      }
    } catch (channelError) {
      logCriticalError('指定チャンネルへの送信でエラー', channelError);
    }
  }

  return { mainMessage: followUpMessage, secondaryMessage };
}

module.exports = {
  buildConfiguredNotificationRoleIds,
  sendAnnouncements
};
