const {
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MediaGalleryBuilder, MediaGalleryItemBuilder
} = require('discord.js');

// Build a consistent ContainerBuilder for recruit messages
function buildContainer({ headerTitle = '募集', participantText = '', recruitIdText = '(unknown)', accentColor = 0x000000, imageAttachmentName = 'attachment://recruit-card.png', recruiterId = null, requesterId = null }) {
  const container = new ContainerBuilder();
  container.setAccentColor(typeof accentColor === 'number' ? accentColor : parseInt(String(accentColor), 16) || 0x000000);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`🎮✨ **${headerTitle}** ✨🎮`)
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(imageAttachmentName)
    )
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(participantText)
  );
  // close ボタンは requesterId が提供されている場合にのみ無効化する（募集主でない場合）
  const isRequesterRecruiter = requesterId && recruiterId ? String(requesterId) === String(recruiterId) : true;
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('join')
        .setLabel('参加')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('取り消し')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('close')
        .setLabel('締め (募集主のみ)')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isRequesterRecruiter)
    )
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`募集ID：\`${recruitIdText}\` | powered by **rectbot**`)
  );
  return container;
}

// Fire-and-forget notification sender
async function sendChannelNotification(channel, content, allowedMentions = { roles: [], users: [] }) {
  if (!channel || typeof channel.send !== 'function') return null;
  (async () => {
    try {
      await channel.send({ content, allowedMentions });
      console.log('通知送信完了');
    } catch (e) {
      console.warn('通知送信失敗:', e?.message || e);
    }
  })();
  return true;
}

module.exports = { buildContainer, sendChannelNotification };
