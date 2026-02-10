/**
 * UI Builder functions extracted from handlers.js
 * Responsible for creating Discord UI components (embeds, buttons, containers)
 * Reduces cyclomatic complexity by separating UI generation logic
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');

/**
 * Converts hex color string to integer for Discord
 * @param {string} hex - Hex color (with or without #)
 * @param {number} fallbackInt - Fallback integer color
 * @returns {number} Integer color
 */
function hexToIntColor(hex, fallbackInt) {
  if (!hex) return fallbackInt || 0x000000;
  let clean = String(hex);
  if (clean.startsWith('#')) clean = clean.slice(1);
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return fallbackInt || 0x000000;
  return parseInt(clean, 16);
}

/**
 * Builds an embed for start time notifications
 * @param {Object} context - Notification context
 * @returns {EmbedBuilder} Configured embed
 */
function buildStartTimeNotificationEmbed(context) {
  const { finalRecruitData, mentions, interaction, actualMessageId } = context;
  
  const notifyColor = hexToIntColor(finalRecruitData?.panelColor || '00FF00', 0x00FF00);
  const embed = new EmbedBuilder()
    .setColor(notifyColor)
    .setTitle('⏰ 開始時刻になりました！')
    .setDescription(`**${finalRecruitData.title}** の募集開始時刻です。`)
    .addFields({ name: '📋 参加者', value: mentions, inline: false })
    .setTimestamp();
  
  // Add voice chat information
  if (finalRecruitData.voice === true) {
    const voiceText = finalRecruitData.voicePlace ? `あり (${finalRecruitData.voicePlace})` : 'あり';
    embed.addFields({ name: '🔊 ボイスチャット', value: voiceText, inline: false });
  } else if (finalRecruitData.voice === false) {
    embed.addFields({ name: '🔇 ボイスチャット', value: 'なし', inline: false });
  }
  
  // Add voice channel URL
  if (finalRecruitData.voiceChannelId) {
    const voiceUrl = `https://discord.com/channels/${interaction.guildId}/${finalRecruitData.voiceChannelId}`;
    embed.addFields({ name: '🔗 ボイスチャンネル', value: `[参加する](${voiceUrl})`, inline: false });
  }
  
  // Add recruitment message link
  const recruitUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${actualMessageId}`;
  embed.addFields({ name: '📋 募集の詳細', value: `[メッセージを確認](${recruitUrl})`, inline: false });
  
  return embed;
}

/**
 * Builds components for start time notification (dedicated channel button if enabled)
 * @param {Object} context - Notification context
 * @returns {Array} Array of ActionRowBuilder components
 */
function buildStartTimeNotificationComponents(context) {
  const { guildSettings, actualRecruitId } = context;
  const components = [];
  
  if (guildSettings?.enable_dedicated_channel) {
    const button = new ButtonBuilder()
      .setCustomId(`create_vc_${actualRecruitId}`)
      .setLabel('専用チャンネル作成')
      .setEmoji('📢')
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(button);
    components.push(row);
  }
  
  return components;
}

/**
 * Builds a text display component
 * @param {Object} component - Component data
 * @returns {TextDisplayBuilder} Text display builder
 */
function buildTextComponent(component) {
  const builder = new TextDisplayBuilder().setContent(component.content);
  if (component.title) builder.setTitle(component.title);
  return builder;
}

/**
 * Builds a separator component
 * @param {Object} component - Component data
 * @returns {SeparatorBuilder} Separator builder
 */
function buildSeparatorComponent(component) {
  const builder = new SeparatorBuilder();
  if (component.spacing === 'large') {
    builder.setSpacingSize(SeparatorSpacingSize.Large);
  } else if (component.spacing === 'small') {
    builder.setSpacingSize(SeparatorSpacingSize.Small);
  }
  if (component.divider) builder.setDivider(true);
  return builder;
}

/**
 * Builds a media gallery component
 * @param {Object} component - Component data
 * @returns {MediaGalleryBuilder} Media gallery builder
 */
function buildMediaGalleryComponent(component) {
  const items = (component.items || []).map(item => 
    new MediaGalleryItemBuilder().setMedia(item.media)
  );
  return new MediaGalleryBuilder().setItems(items);
}

/**
 * Adds a component to a container based on its type
 * @param {ContainerBuilder} container - Container to add to
 * @param {Object} component - Component to add
 * @returns {ContainerBuilder} Modified container
 */
function addComponentToContainer(container, component) {
  if (component.type === 'text') {
    container.addTextDisplay(buildTextComponent(component));
  } else if (component.type === 'separator') {
    container.addSeparator(buildSeparatorComponent(component));
  } else if (component.type === 'gallery') {
    container.addMediaGallery(buildMediaGalleryComponent(component));
  }
  return container;
}

/**
 * Builds a container from a layout configuration
 * @param {Array} layout - Layout components array
 * @returns {ContainerBuilder} Built container
 */
function buildContainerFromLayout(layout) {
  const container = new ContainerBuilder();
  for (const component of layout) {
    addComponentToContainer(container, component);
  }
  return container;
}

module.exports = {
  hexToIntColor,
  buildStartTimeNotificationEmbed,
  buildStartTimeNotificationComponents,
  buildTextComponent,
  buildSeparatorComponent,
  buildMediaGalleryComponent,
  addComponentToContainer,
  buildContainerFromLayout
};
