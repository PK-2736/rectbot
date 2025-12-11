const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  ThumbnailBuilder
} = require('discord.js');

// Build a consistent ContainerBuilder for recruit messages
function buildContainer({ headerTitle = '募集', participantText = '', recruitIdText = '(unknown)', accentColor = 0x000000, imageAttachmentName = 'attachment://recruit-card.png', recruiterId = null, requesterId = null, footerExtra = null, subHeaderText = null, contentText = '', titleText = '', avatarUrl = null }) {
  const container = new ContainerBuilder();
  container.setAccentColor(typeof accentColor === 'number' ? accentColor : parseInt(String(accentColor), 16) || 0x000000);
  // 画像スタイル用: コンテナ直下にテキストを追加（サムネイルは非表示）
  const isImageStyle = !!imageAttachmentName;
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`🎮 **${headerTitle}**`)
  );
  if (subHeaderText && String(subHeaderText).trim().length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(subHeaderText))
    );
  }
  // 画像スタイルではタイトルは画像に埋め込み済みのため表示しない
  if (!isImageStyle && titleText && String(titleText).trim().length > 0) {
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
  // 画像スタイルでは募集内容テキストは画像に埋め込み済みのため表示しない
  if (!isImageStyle && contentText && String(contentText).trim().length > 0) {
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
  // ヘッダーセクション（サムネ付き）
  const headerSection = new SectionBuilder();
  if (avatarUrl && typeof avatarUrl === 'string') {
    try {
      const thumb = new ThumbnailBuilder({ media: { url: avatarUrl } });
      // 希望サイズで表示（APIが対応している場合のみ）
      try {
        if (typeof thumb.setWidth === 'function') thumb.setWidth(32);
        if (typeof thumb.setHeight === 'function') thumb.setHeight(32);
        if (typeof thumb.setSize === 'function') thumb.setSize(32);
      } catch (_) {}
      headerSection.setThumbnailAccessory(thumb);
    } catch (_) {}
  }
  // タイトルを最上段に配置（強調表示は呼び出し側で整形）
  if (titleText && String(titleText).trim().length > 0) {
    headerSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(titleText)));
  }
  // 次に「〜さんの募集」を表示
  headerSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎮 **${headerTitle}**`));
  // 通知ロールなどのサブヘッダー
  if (subHeaderText && String(subHeaderText).trim().length > 0) {
    headerSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(subHeaderText)));
  }
  container.addSectionComponents(headerSection);
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
