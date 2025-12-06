const {
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  ThumbnailBuilder
} = require('discord.js');

// Build a consistent ContainerBuilder for recruit messages
function buildContainer({ headerTitle = '募集', participantText = '', recruitIdText = '(unknown)', accentColor = 0x000000, imageAttachmentName = 'attachment://recruit-card.png', recruiterId = null, requesterId = null, footerExtra = null, subHeaderText = null, contentText = '', titleText = '', avatarUrl = null }) {
  const container = new ContainerBuilder();
  container.setAccentColor(typeof accentColor === 'number' ? accentColor : parseInt(String(accentColor), 16) || 0x000000);
  // 右上サムネイルアクセサリ
  if (avatarUrl && typeof avatarUrl === 'string') {
    // Primary path: ThumbnailBuilder
    try {
      const thumb = new ThumbnailBuilder({ media: { url: avatarUrl } });
      container.setThumbnailAccessory(thumb);
      console.log('[components-v2] thumbnail accessory applied via builder');
    } catch (e1) {
      console.warn('[components-v2] builder path failed, trying URL string:', e1?.message || e1);
      // Fallback A: setThumbnailAccessory(URL string)
      try {
        if (typeof container.setThumbnailAccessory === 'function') {
          container.setThumbnailAccessory(avatarUrl);
          console.log('[components-v2] thumbnail accessory applied via URL string (setThumbnailAccessory)');
        } else if (typeof container.setThumbnailAccesory === 'function') {
          // Fallback B: legacy misspelled API
          container.setThumbnailAccesory(avatarUrl);
          console.log('[components-v2] thumbnail accessory applied via URL string (setThumbnailAccesory)');
        } else {
          console.warn('[components-v2] no thumbnail accessory method available on container');
        }
      } catch (e2) {
        console.warn('[components-v2] URL string path failed:', e2?.message || e2);
      }
    }
  }
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`🎮 **${headerTitle}**`)
  );
  if (subHeaderText && String(subHeaderText).trim().length > 0) {
    // ヘッダー直下に通知ロールを表示
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(subHeaderText))
    );
  }
  if (titleText && String(titleText).trim().length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(titleText))
    );
  }
  // 上記の（サブヘッダー/タイトル）ブロックの後に区切り線を入れて、画像セクションへ
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
  if (contentText && String(contentText).trim().length > 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(contentText)));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(participantText)
  );
  // close ボタンはグローバルには無効化せずに常に表示する（権限チェックはボタンハンドラ側で行う）
  const isRequesterRecruiter = true;
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
        .setLabel('締め')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false)
    )
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  const footerParts = [`募集ID：\`${recruitIdText}\``];
  if (footerExtra) footerParts.push(footerExtra);
  footerParts.push('powered by Recrubo');
  const footerText = footerParts.join(' | ');
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(footerText)
  );
  return container;
}

// Simple text-first container (no image gallery)
function buildContainerSimple({ headerTitle = '募集', detailsText = '', participantText = '', recruitIdText = '(unknown)', accentColor = 0x000000, footerExtra = null, subHeaderText = null, contentText = '', titleText = '', avatarUrl = null }) {
  const container = new ContainerBuilder();
  container.setAccentColor(typeof accentColor === 'number' ? accentColor : parseInt(String(accentColor), 16) || 0x000000);
  // 右上サムネイルアクセサリ（横並び用の指定）
  if (avatarUrl && typeof avatarUrl === 'string') {
    try {
      const thumb = new ThumbnailBuilder({ media: { url: avatarUrl } });
      container.setThumbnailAccessory(thumb);
      console.log('[components-v2] (simple) thumbnail accessory applied via builder');
    } catch (e1) {
      console.warn('[components-v2] (simple) builder path failed, trying URL string:', e1?.message || e1);
      try {
        if (typeof container.setThumbnailAccessory === 'function') {
          container.setThumbnailAccessory(avatarUrl);
          console.log('[components-v2] (simple) thumbnail accessory applied via URL string (setThumbnailAccessory)');
        } else if (typeof container.setThumbnailAccesory === 'function') {
          container.setThumbnailAccesory(avatarUrl);
          console.log('[components-v2] (simple) thumbnail accessory applied via URL string (setThumbnailAccesory)');
        } else {
          console.warn('[components-v2] (simple) no thumbnail accessory method available on container');
        }
      } catch (e2) {
        console.warn('[components-v2] (simple) URL string path failed:', e2?.message || e2);
      }
    }
  }
  // タイトルを最上段に配置（強調表示は呼び出し側で整形）
  if (titleText && String(titleText).trim().length > 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(titleText)));
  }
  // 次に「〜さんの募集」を表示
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎮 **${headerTitle}**`));
  // 通知ロールなどのサブヘッダー
  if (subHeaderText && String(subHeaderText).trim().length > 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(subHeaderText)));
  }
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  if (detailsText) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(detailsText));
    // ユーザー要望: 「通話情報」と「募集内容」の間に区切り線は入れない
    // contentText が存在しない場合にのみ、ここで区切り線を入れる
    if (!contentText || String(contentText).trim().length === 0) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    }
  }
  if (contentText && String(contentText).trim().length > 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(contentText)));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }
  if (participantText) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(participantText));
  }
  const isRequesterRecruiter = true;
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join').setLabel('参加').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cancel').setLabel('取り消し').setEmoji('✖️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('close').setLabel('締め').setStyle(ButtonStyle.Secondary).setDisabled(false)
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  const footerParts = [`募集ID：\`${recruitIdText}\``];
  if (footerExtra) footerParts.push(footerExtra);
  footerParts.push('powered by Recrubo');
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerParts.join(' | ')));
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

module.exports = { buildContainer, buildContainerSimple, sendChannelNotification };
