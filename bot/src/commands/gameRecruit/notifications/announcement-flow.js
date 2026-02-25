/**
 * アナウンスメントフローモジュール
 * 募集案内の送信とチャンネル管理
 */

const { MessageFlags } = require('discord.js');
const { handlePermissionError } = require('../../../utils/handlePermissionError');
const { buildConfiguredNotificationRoleIds } = require('../notifications/notification-role-selector');

/**
 * メッセージオプションを構築
 */
function buildMessageOptions(container, image, extraComponents = []) {
  const baseOptions = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: [] }
  };
  if (Array.isArray(extraComponents) && extraComponents.length > 0) {
    baseOptions.components.push(...extraComponents);
  }
  if (image) baseOptions.files = [image];
  return baseOptions;
}

/**
 * 通知コンテンツを作成
 */
function createNotificationContent(roleId) {
  if (roleId === 'everyone') {
    return { content: '新しい募集が作成されました。@everyone', mentions: { parse: ['everyone'] } };
  }
  if (roleId === 'here') {
    return { content: '新しい募集が作成されました。@here', mentions: { parse: ['everyone'] } };
  }
  if (roleId) {
    return { content: `新しい募集が作成されました。<@&${roleId}>`, mentions: { roles: [roleId] } };
  }
  return { content: '新しい募集が作成されました。<@&1416797165769986161>', mentions: { roles: ['1416797165769986161'] } };
}

/**
 * 非同期で通知を送信
 */
function sendNotificationAsync(channel, roleId) {
  (async () => {
    try {
      const { content, mentions } = createNotificationContent(roleId);
      await channel.send({ content, allowedMentions: mentions });
    } catch (e) {
      console.warn('通知送信失敗:', e?.message || e);
    }
  })();
}

/**
 * 募集案内を複数チャンネルに送信
 */
async function sendAnnouncements(interaction, options = {}) {
  const { selectedNotificationRole, configuredIds = [], image, container, guildSettings, extraComponents = [] } = options;
  const shouldUseDefaultNotification = !selectedNotificationRole && configuredIds.length === 0;
  
  // 通知を送信
  if (selectedNotificationRole || shouldUseDefaultNotification) {
    sendNotificationAsync(interaction.channel, selectedNotificationRole || null);
  }

  // メイン投稿
  const messageOptions = buildMessageOptions(container, image, extraComponents);
  const followUpMessage = await interaction.channel.send(messageOptions);
  let secondaryMessage = null;

  // 別チャンネルにも投稿
  const primaryRecruitChannelId = Array.isArray(guildSettings.recruit_channels) && guildSettings.recruit_channels.length > 0
    ? guildSettings.recruit_channels[0]
    : guildSettings.recruit_channel;

  if (!primaryRecruitChannelId || primaryRecruitChannelId === interaction.channelId) {
    return { mainMessage: followUpMessage, secondaryMessage: null };
  }

  try {
    const recruitChannel = await interaction.guild.channels.fetch(primaryRecruitChannelId);
    if (!recruitChannel?.isTextBased()) {
      return { mainMessage: followUpMessage, secondaryMessage: null };
    }

    // 別チャンネルでも通知を送信
    if (selectedNotificationRole || shouldUseDefaultNotification) {
      sendNotificationAsync(recruitChannel, selectedNotificationRole || null);
    }

    // 募集メッセージ投稿
    try {
      const secondaryOptions = buildMessageOptions(container, image, extraComponents);
      secondaryMessage = await recruitChannel.send(secondaryOptions);
    } catch (e) {
      console.warn('募集メッセージ送信失敗(指定ch):', e?.message || e);
    }
  } catch (channelError) {
    console.error('指定チャンネルへの送信でエラー:', channelError);
  }

  return { mainMessage: followUpMessage, secondaryMessage };
}

/**
 * 募集アナウンスを送信（エラーハンドリング付き）
 */
async function sendRecruitmentAnnouncementsFlow(interaction, recruitDataObj, guildSettings, uiData) {
  const configuredIds = buildConfiguredNotificationRoleIds(guildSettings);
  
  try {
    const result = await sendAnnouncements(interaction, {
      selectedNotificationRole: recruitDataObj.notificationRoleId,
      configuredIds,
      image: uiData.image,
      container: uiData.container,
      guildSettings,
      user: uiData.user
    });
    return { followUpMessage: result.mainMessage, secondaryMessage: result.secondaryMessage };
  } catch (e) {
    console.warn('[sendRecruitmentAnnouncementsFlow] sendAnnouncements failed:', e?.message || e);
    
    if (e.code === 50001 || e.code === 50013) {
      try {
        await handlePermissionError(uiData.user, e, { commandName: 'rect', channelName: interaction.channel.name });
      } catch (dmErr) {
        console.error('[sendRecruitmentAnnouncementsFlow] Failed to send permission error DM:', dmErr?.message || dmErr);
      }
    }
    
    return { followUpMessage: null, secondaryMessage: null };
  }
}

module.exports = {
  buildMessageOptions,
  createNotificationContent,
  sendNotificationAsync,
  sendAnnouncements,
  sendRecruitmentAnnouncementsFlow
};
