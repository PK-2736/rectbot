const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  ThumbnailBuilder
} = require('discord.js');

function normalizeAccentColor(accentColor) {
  if (typeof accentColor === 'number') return accentColor;
  return parseInt(String(accentColor), 16) || 0xFFFFFF;
}

function buildFooterText(recruitIdText, footerExtra) {
  const footerParts = [`募集ID：\`${recruitIdText}\``];
  if (footerExtra) footerParts.push(footerExtra);
  footerParts.push('powered by Recrubo');
  return footerParts.join(' | ');
}

function buildActionRow(extraActionButtons = [], logLabel = 'buildContainer') {
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join').setLabel('参加').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cancel').setLabel('取り消し').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('close').setLabel('締め').setStyle(ButtonStyle.Secondary).setDisabled(false)
  );

  if (Array.isArray(extraActionButtons) && extraActionButtons.length > 0) {
    try {
      const safeButtons = extraActionButtons.slice(0, Math.max(0, 5 - 3));
      actionRow.addComponents(...safeButtons);
    } catch (e) {
      console.warn(`[${logLabel}] failed to add extraActionButtons:`, e?.message || e);
    }
  }

  return actionRow;
}

function addHeaderComponents(container, headerTitle, subHeaderText) {
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`🎮 **${headerTitle}**`)
  );
  if (subHeaderText && String(subHeaderText).trim().length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(subHeaderText))
    );
  }
}

function addTitleComponent(container, titleText, isImageStyle) {
  if (!isImageStyle && titleText && String(titleText).trim().length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(titleText))
    );
  }
}

function addImageGallery(container, imageAttachmentName) {
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
}

function addContentTextIfNeeded(container, contentText, isImageStyle) {
  if (!isImageStyle && contentText && String(contentText).trim().length > 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(contentText)));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }
}

function addFooterComponents(container, participantText, recruitIdText, footerExtra, extraActionButtons) {
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(participantText)
  );
  container.addActionRowComponents(buildActionRow(extraActionButtons, 'buildContainer'));
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(buildFooterText(recruitIdText, footerExtra))
  );
}

// Build a consistent ContainerBuilder for recruit messages
function buildContainer({ headerTitle = '募集', participantText = '', recruitIdText = '(unknown)', accentColor = 0xFFFFFF, imageAttachmentName = 'attachment://recruit-card.png', recruiterId: _recruiterId = null, requesterId: _requesterId = null, footerExtra = null, subHeaderText = null, contentText = '', titleText = '', avatarUrl: _avatarUrl = null, extraActionButtons = [] }) {
  const container = new ContainerBuilder();
  container.setAccentColor(normalizeAccentColor(accentColor));
  
  const isImageStyle = !!imageAttachmentName;
  
  addHeaderComponents(container, headerTitle, subHeaderText);
  addTitleComponent(container, titleText, isImageStyle);
  addImageGallery(container, imageAttachmentName);
  addContentTextIfNeeded(container, contentText, isImageStyle);
  addFooterComponents(container, participantText, recruitIdText, footerExtra, extraActionButtons);
  
  return container;
}

/**
 * Apply thumbnail accessory to section with error handling
 */
function applyThumbnailAccessory(headerSection, avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return false;
  
  try {
    const thumb = new ThumbnailBuilder({ media: { url: avatarUrl } });
    headerSection.setThumbnailAccessory(thumb);
    return true;
  } catch (thumbErr) {
    console.warn('[applyThumbnailAccessory] ThumbnailBuilder failed:', thumbErr.message);
    return false;
  }
}

/**
 * Clean up undefined properties from section builder
 */
function cleanupSectionBuilder(headerSection) {
  if (Object.prototype.hasOwnProperty.call(headerSection, 'accessory') && headerSection.accessory === undefined) {
    delete headerSection.accessory;
  }
  if (Object.prototype.hasOwnProperty.call(headerSection, 'thumbnail') && headerSection.thumbnail === undefined) {
    delete headerSection.thumbnail;
  }
}

/**
 * Add header section to container with fallback
 */
function addHeaderSectionToContainer(container, headerSection, titleText, headerTitle, subHeaderText) {
  try {
    // 未定義のプロパティを削除してバリデーション
    cleanupSectionBuilder(headerSection);
    // toJSON()をテストしてバリデーション
    headerSection.toJSON();
    container.addSectionComponents(headerSection);
    return true;
  } catch (sectionErr) {
    console.warn('[addHeaderSectionToContainer] SectionBuilder validation failed, falling back to text-only:', sectionErr.message);
    // フォールバック: テキストのみ追加
    if (titleText && String(titleText).trim().length > 0) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(titleText)));
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎮 **${headerTitle}**`));
    if (subHeaderText && String(subHeaderText).trim().length > 0) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(subHeaderText)));
    }
    return false;
  }
}

/**
 * Add text lines to container
 */
function addTextLinesToContainer(container, text) {
  const lines = String(text).split('\n').filter(Boolean);
  lines.forEach(line => {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(line)));
  });
}

/**
 * Build header section with avatar
 */
function buildHeaderSection(titleText, headerTitle, subHeaderText, avatarUrl) {
  const headerSection = new SectionBuilder();
  
  // アバター（ThumbnailAccessory）を設定
  applyThumbnailAccessory(headerSection, avatarUrl);
  
  // ヘッダーテキスト追加
  if (titleText && String(titleText).trim().length > 0) {
    headerSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(titleText)));
  }
  headerSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎮 **${headerTitle}**`));
  if (subHeaderText && String(subHeaderText).trim().length > 0) {
    headerSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(subHeaderText)));
  }
  
  return headerSection;
}

// Simple text-first container (no image gallery, but with header section that can have avatar)
function buildContainerSimple({ headerTitle = '募集', detailsText = '', participantText = '', recruitIdText = '(unknown)', accentColor = 0xFFFFFF, footerExtra = null, subHeaderText = null, contentText = '', titleText = '', avatarUrl = null, extraActionButtons = [] }) {
  const container = new ContainerBuilder();
  container.setAccentColor(normalizeAccentColor(accentColor));
  
  // ヘッダーセクション（アバター付き）
  const headerSection = buildHeaderSection(titleText, headerTitle, subHeaderText, avatarUrl);
  
  // SectionBuilder をコンテナに追加（フォールバック処理含む）
  addHeaderSectionToContainer(container, headerSection, titleText, headerTitle, subHeaderText);
  
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  
  if (detailsText) {
    // detailsText を各行に分割して個別に追加（マークダウンを正しく処理）
    console.log('[buildContainerSimple] detailsLines:', String(detailsText).split('\n').filter(Boolean));
    addTextLinesToContainer(container, detailsText);
    // ユーザー要望: 「通話情報」と「募集内容」の間に区切り線は入れない
    // contentText が存在しない場合にのみ、ここで区切り線を入れる
    if (!contentText || String(contentText).trim().length === 0) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    }
  }
  
  if (contentText && String(contentText).trim().length > 0) {
    // contentText も各行に分割して個別に追加
    console.log('[buildContainerSimple] contentText:', contentText, 'contentLines:', String(contentText).split('\n').filter(Boolean));
    addTextLinesToContainer(container, contentText);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }
  
  if (participantText) {
    // participantText も各行に分割して個別に追加（マークダウンを正しく処理）
    console.log('[buildContainerSimple] participantLines:', String(participantText).split('\n').filter(Boolean));
    addTextLinesToContainer(container, participantText);
  }
  container.addActionRowComponents(buildActionRow(extraActionButtons, 'buildContainerSimple'));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(buildFooterText(recruitIdText, footerExtra)));
  
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
