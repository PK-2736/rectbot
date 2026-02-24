const { EmbedBuilder } = require('discord.js');

async function sendStartNotificationEmbed(channel, recruitData) {
  const title = recruitData.metadata?.title || '募集';
  const game = recruitData.metadata?.game || 'ゲーム';
  
  const embed = new EmbedBuilder()
    .setTitle('🔔 募集開始時刻です！')
    .setDescription(`**${title}** (${game})`)
    .setColor(0xffa500)
    .setTimestamp();

  const participants = recruitData.participants || [];
  if (participants.length > 0) {
    const mentions = participants.map(p => `<@${p.userId}>`).join(' ');
    embed.addFields({ name: '参加者', value: mentions, inline: false });
  }

  try {
    await channel.send({
      content: participants.map(p => `<@${p.userId}>`).join(' '),
      embeds: [embed],
      allowedMentions: { users: participants.map(p => p.userId) }
    });
    console.log(`[NOTIFICATION] Sent start notification for recruitId=${recruitData.messageId}`);
  } catch (error) {
    console.error('[NOTIFICATION_ERROR] Failed to send start notification:', error);
  }
}

async function setupStartTimeNotification(interaction, recruitData, startAt) {
  if (!startAt) return;

  const now = Date.now();
  const delay = startAt - now;
  
  if (delay <= 0) {
    console.log('[NOTIFICATION] startAt is in the past, skipping notification');
    return;
  }

  if (delay > 2147483647) {
    console.warn('[NOTIFICATION] delay too large for setTimeout, skipping');
    return;
  }

  console.log(`[NOTIFICATION] Setting up notification in ${Math.floor(delay / 1000)}s for recruitId=${recruitData.messageId}`);

  setTimeout(async () => {
    try {
      const channel = await interaction.client.channels.fetch(recruitData.channelId);
      if (channel) {
        await sendStartNotificationEmbed(channel, recruitData);
      } else {
        console.warn(`[NOTIFICATION] Channel ${recruitData.channelId} not found`);
      }
    } catch (error) {
      console.error('[NOTIFICATION_ERROR]', error);
    }
  }, delay);
}

module.exports = {
  sendStartNotificationEmbed,
  setupStartTimeNotification
};
