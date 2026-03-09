const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js');

const { updateRecruitmentData, getGuildSettingsFromRedis, listRecruitsFromRedis } = require('../utils/database');
const { safeRespond } = require('../utils/interactionHandler');
const { getActiveRecruits } = require('../utils/database/db/statusApi');
const { generateRecruitCardQueued } = require('../utils/canvas/imageQueue');
const { buildContainer, buildContainerSimple } = require('../utils/recruit/recruitHelpers');
const backendFetch = require('../utils/backendFetch');
const config = require('../config');

async function fetchRecruitById(recruitId) {
  const base = config.BACKEND_API_URL.replace(/\/$/, '');
  console.log(`[fetchRecruitById] Attempting to fetch recruitId: ${recruitId}`);
  // Try plural first, then singular path
  try {
    const url = `${base}/api/recruits/${encodeURIComponent(recruitId)}`;
    console.log(`[fetchRecruitById] Trying URL: ${url}`);
    const body = await backendFetch(url);
    console.log(`[fetchRecruitById] Success with /api/recruits/`);
    return body;
  } catch (e1) {
    console.log(`[fetchRecruitById] /api/recruits/ failed: ${e1.status || e1.message}`);
    try {
      const url = `${base}/api/recruitment/${encodeURIComponent(recruitId)}`;
      console.log(`[fetchRecruitById] Trying URL: ${url}`);
      const body = await backendFetch(url);
      console.log(`[fetchRecruitById] Success with /api/recruitment/`);
      return body;
    } catch (e2) {
      console.log(`[fetchRecruitById] /api/recruitment/ also failed: ${e2.status || e2.message}`);
      throw e2;
    }
  }
}

function buildArgUpdates(interaction) {
  const updates = {};
  const titleArg = interaction.options.getString('タイトル');
  const peopleArg = interaction.options.getInteger('人数');
  const startArg = interaction.options.getString('開始時間');
  const vcArg = interaction.options.getString('通話有無');
  const placeArg = interaction.options.getChannel('通話場所');
  const colorArg = interaction.options.getString('色');

  if (titleArg) updates.title = titleArg;
  if (peopleArg) updates.participants = peopleArg;
  if (startArg) updates.startTime = startArg;
  if (vcArg !== null) updates.vc = vcArg;
  if (placeArg) updates.voiceChannel = { id: placeArg.id, name: placeArg.name };
  if (colorArg) updates.panelColor = colorArg;

  return updates;
}

function cacheArgUpdates(client, argUpdates) {
  if (!client.rectEditArgCache) {
    client.rectEditArgCache = new Map();
  }
  const cacheKey = Math.random().toString(36).slice(2, 10);
  client.rectEditArgCache.set(cacheKey, argUpdates);
  setTimeout(() => client.rectEditArgCache.delete(cacheKey), 5 * 60 * 1000);
  return cacheKey;
}

function buildEditModal(customId, recruit) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('募集内容編集');

  const contentInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('募集内容')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setValue(recruit.description || recruit.content || '');

  modal.addComponents(new ActionRowBuilder().addComponents(contentInput));
  return modal;
}

function buildUpdatePayload(content, argUpdates) {
  const update = {
    description: content !== null ? content : undefined,
    content: content !== null ? content : undefined,
  };

  if (argUpdates.title) update.title = argUpdates.title;
  if (argUpdates.participants) update.participants = argUpdates.participants;
  if (argUpdates.startTime) update.startTime = argUpdates.startTime;
  if (argUpdates.vc !== undefined) update.vc = argUpdates.vc;
  if (argUpdates.voiceChannel?.name) update.note = argUpdates.voiceChannel.name;
  if (argUpdates.panelColor) update.panelColor = argUpdates.panelColor;

  return update;
}

function normalizeParticipants(recruitData) {
  let participants = Array.isArray(recruitData.participants) ? recruitData.participants : [];
  if (!participants.length && recruitData.ownerId) participants = [recruitData.ownerId];
  participants = Array.from(new Set(participants));
  const maxMembersCap = Number(recruitData.maxMembers) || null;
  if (maxMembersCap && participants.length > maxMembersCap) {
    participants = participants.slice(0, maxMembersCap);
  }
  return participants;
}

async function resolveRecruitStyle(guildId) {
  const guildSettings = await getGuildSettingsFromRedis(guildId).catch(() => ({}));
  return guildSettings?.recruit_style === 'simple' ? 'simple' : 'image';
}

function resolveAccentColor(recruitData) {
  const useColor = recruitData.panelColor || recruitData.metadata?.panelColor || '000000';
  const accentColor = /^[0-9A-Fa-f]{6}$/.test(useColor) ? parseInt(useColor, 16) : 0x000000;
  return { useColor, accentColor };
}

function buildParticipantText(recruitData, participants) {
  const currentMembers = participants.length;
  const maxMembers = Number(recruitData.maxMembers) || currentMembers;
  const remainingSlots = maxMembers - currentMembers;
  return `📋 参加リスト (**あと${remainingSlots}人**)\n${participants.map(id => `<@${id}>`).join(' • ')}`;
}

function buildSimpleParticipantText(recruitData, participants) {
  const currentMembers = participants.length;
  const maxMembers = Number(recruitData.maxMembers) || currentMembers;
  const remainingSlots = maxMembers - currentMembers;
  return `**📋 参加リスト** \`(あと${remainingSlots}人)\`\n${participants.map(id => `<@${id}>`).join(' • ')}`;
}

module.exports = {
  noDefer: true,
  data: new SlashCommandBuilder()
    .setName('rect_edit')
    .setDescription('募集を編集します')
    .addStringOption(o =>
      o.setName('id')
        .setDescription('募集ID（パネル下部の8桁）')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(o => o.setName('タイトル').setDescription('新しいタイトル').setRequired(false))
    .addIntegerOption(o => o.setName('人数').setDescription('参加人数（1-16）').setRequired(false).setMinValue(1).setMaxValue(16))
    .addStringOption(o => 
      o.setName('開始時間')
        .setDescription('開始時間（例: 今から/21:00）')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(o => 
      o.setName('通話有無')
        .setDescription('通話の有無')
        .setRequired(false)
        .addChoices(
          { name: 'あり', value: 'あり' },
          { name: 'なし', value: 'なし' },
          { name: 'あり(聞き専)', value: 'あり(聞き専)' }
        )
    )
    .addChannelOption(o => 
      o.setName('通話場所')
        .setDescription('通話で使うボイスチャンネル')
        .addChannelTypes(2, 13)
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName('色')
        .setDescription('募集パネルの色')
        .setRequired(false)
        .addChoices(
          { name: '赤', value: 'FF0000' },
          { name: 'オレンジ', value: 'FF8000' },
          { name: '黄', value: 'FFFF00' },
          { name: '緑', value: '00FF00' },
          { name: '水色', value: '00FFFF' },
          { name: '青', value: '0000FF' },
          { name: '紫', value: '8000FF' },
          { name: 'ピンク', value: 'FF69B4' },
          { name: '茶', value: '8B4513' },
          { name: '白', value: 'FFFFFF' },
          { name: '黒', value: '000000' },
          { name: 'グレー', value: '808080' }
        )
    ),

  async validateRecruitId(interaction, recruitId) {
    if (recruitId === 'NO_ACTIVE') {
      await safeRespond(interaction, { content: '❌ 編集できる募集がありません。', flags: MessageFlags.Ephemeral });
      return false;
    }
    return true;
  },

  extractRecruitMetadata(recruit) {
    const ownerId = recruit?.ownerId || recruit?.metadata?.raw?.recruiterId;
    const messageId = recruit?.metadata?.messageId;
    return { ownerId, messageId };
  },

  async validateRecruitOwnership(interaction, ownerId, messageId) {
    if (!ownerId || !messageId) {
      await safeRespond(interaction, { content: '❌ 募集の取得に失敗しました。', flags: MessageFlags.Ephemeral });
      return false;
    }
    if (String(ownerId) !== interaction.user.id) {
      await safeRespond(interaction, { content: '❌ 募集主のみが編集できます。', flags: MessageFlags.Ephemeral });
      return false;
    }
    return true;
  },

  async execute(interaction) {
    const recruitId = interaction.options.getString('id');
    console.log(`[rect-edit] execute called with recruitId: ${recruitId}`);
    
    if (!await this.validateRecruitId(interaction, recruitId)) {
      return;
    }

    const argUpdates = buildArgUpdates(interaction);
    console.log(`[rect-edit] argUpdates:`, argUpdates);

    try {
      // DO NOT defer - showModal must be the first response
      const recruit = await fetchRecruitById(recruitId);
      console.log(`[rect-edit] recruit fetched:`, { id: recruit?.recruitId || recruit?.id, title: recruit?.title });
      
      const { ownerId, messageId } = this.extractRecruitMetadata(recruit);
      if (!await this.validateRecruitOwnership(interaction, ownerId, messageId)) {
        return;
      }

      const cacheKey = cacheArgUpdates(interaction.client, argUpdates);

      // Show modal with short customId
      const cid = `editRecruitModal_${messageId}_${cacheKey}`.slice(0, 100);
      await interaction.showModal(buildEditModal(cid, recruit));
    } catch (error) {
      console.error('[rect-edit] fetch or modal error', error);
      // Only respond if we haven't shown the modal yet
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ 募集が見つかりませんでした。', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },

  async handleStartTimeAutocomplete(interaction, focused) {
    const suggestions = [
      { name: '今から', value: '今から' },
      { name: '21:00', value: '21:00' },
      { name: '22:00', value: '22:00' },
      { name: '23:00', value: '23:00' },
      { name: '20:00', value: '20:00' },
      { name: '19:00', value: '19:00' },
      { name: '18:00', value: '18:00' },
    ];
    const filtered = suggestions.filter(s => 
      !focused || s.name.includes(focused) || s.value.includes(focused)
    );
    await interaction.respond(filtered.slice(0, 25));
  },

  filterRecruitingStatus(list) {
    return list.filter(r => {
      const status = String(r?.status || 'recruiting').toLowerCase();
      return status === 'recruiting' || status === 'active';
    });
  },

  filterByGuild(list, guildId) {
    if (!guildId) return list;
    return list.filter(r => {
      const gid = String(r?.metadata?.guildId ?? r?.guildId ?? r?.guild_id ?? '');
      return gid === String(guildId);
    });
  },

  filterByOwner(list, userId) {
    if (!userId) return list;
    return list.filter(r => {
      const owner = String(
        r?.ownerId ??
        r?.owner_id ??
        r?.recruiterId ??
        r?.metadata?.raw?.recruiterId ??
        ''
      );
      return owner === String(userId);
    });
  },

  mapToAutocompleteFormat(list) {
    return list.map(r => ({
      id: r.recruitId || r.id,
      title: r.title || r.game || '募集',
      start: r.startTime || r.metadata?.startLabel || '',
      voice: r.voice,
      guildId: r.metadata?.guildId,
    }));
  },

  async fetchAndFilterRecruits(guildId, userId) {
    const res = await getActiveRecruits();
    let list = Array.isArray(res?.body) ? res.body : [];

    // backend active list が空の場合は Redis からフォールバック
    if (list.length === 0) {
      list = await listRecruitsFromRedis().catch(() => []);
    }

    console.log(`[rect-edit autocomplete] Found ${list.length} total recruits`);
    
    const recruitingOnly = this.filterRecruitingStatus(list);
    const guildFiltered = this.filterByGuild(recruitingOnly, guildId);
    const ownerFiltered = this.filterByOwner(guildFiltered, userId);
    return this.mapToAutocompleteFormat(ownerFiltered);
  },

  buildAutocompleteOptions(filtered, focused) {
    return filtered
      .filter(r => !focused || String(r.id).includes(focused) || (r.title && r.title.includes(focused)))
      .slice(0, 25)
      .map(r => ({
        name: `${r.title} | ${r.start || ''} | ${r.id}`.slice(0, 100),
        value: String(r.id).slice(-100)
      }));
  },

  async respondAutocomplete(interaction, options) {
    console.log(`[rect-edit autocomplete] Responding with ${options.length} options`, options.map(o => o.value));
    if (options.length === 0) {
      await interaction.respond([{ name: 'アクティブな募集なし', value: 'NO_ACTIVE' }]);
    } else {
      await interaction.respond(options);
    }
  },

  async autocomplete(interaction) {
    const focusedName = interaction.options.getFocused(true)?.name;
    
    // 開始時間のオートコンプリート
    if (focusedName === '開始時間') {
      const focused = (interaction.options.getFocused() || '').trim();
      await this.handleStartTimeAutocomplete(interaction, focused);
      return;
    }

    // 募集IDのオートコンプリート
    try {
      const focused = (interaction.options.getFocused() || '').trim();
      const guildId = interaction.guild?.id;
      const userId = interaction.user?.id;
      
      const filtered = await this.fetchAndFilterRecruits(guildId, userId);
      console.log(`[rect-edit autocomplete] After filtering: ${filtered.length} recruits`, filtered.map(r => r.id));
      
      const options = this.buildAutocompleteOptions(filtered, focused);
      await this.respondAutocomplete(interaction, options);
    } catch (err) {
      console.error('[rect-edit] autocomplete error', err);
      try { await interaction.respond([]); } catch (_) { /* ignore */ }
    }
  },

  async handleModalSubmit(interaction) {
    console.log('[rect-edit handleModalSubmit] called with customId:', interaction.customId);
    
    const extracted = extractCacheKey(interaction.customId);
    if (!extracted) {
      console.log('[rect-edit handleModalSubmit] skipped - customId does not start with editRecruitModal_');
      return;
    }
    
    console.log('[rect-edit handleModalSubmit] processing editRecruitModal');
    const { messageId, cacheKey } = extracted;
    const argUpdates = retrieveArgUpdates(interaction.client, cacheKey);

    try {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ content: '⏳ 募集を更新中...' });
      runUpdateFlow(interaction, messageId, argUpdates);
    } catch (error) {
      console.error('[rect-edit] Modal submit error', error);
      if (!interaction.replied && !interaction.deferred) {
        await safeRespond(interaction, { content: '❌ 更新に失敗しました。', flags: MessageFlags.Ephemeral });
      } else if (interaction.deferred) {
        await interaction.editReply({ content: '❌ 更新に失敗しました。' }).catch(() => {});
      }
    }
  }
};

function extractCacheKey(customId) {
  if (!customId.startsWith('editRecruitModal_')) {
    return null;
  }
  const parts = customId.replace('editRecruitModal_', '').split('_');
  return { messageId: parts[0], cacheKey: parts[1] || null };
}

function retrieveArgUpdates(client, cacheKey) {
  if (!cacheKey || !client.rectEditArgCache) {
    return {};
  }
  
  const argUpdates = client.rectEditArgCache.get(cacheKey) || {};
  client.rectEditArgCache.delete(cacheKey);
  return argUpdates;
}

async function executeRecruitUpdate(interaction, messageId, content, argUpdates) {
  const update = buildUpdatePayload(content, argUpdates);
  console.log('[rect-edit] handleModalSubmit - messageId:', messageId);
  console.log('[rect-edit] Updating recruit with:', update);

  const result = await updateRecruitmentData(messageId, update);
  console.log('[rect-edit] updateRecruitmentData result:', { ok: result.ok, status: result.status });

  if (!result.ok || !result.body?.recruit) {
    console.error('[rect-edit] Update failed or no recruit data returned');
    return null;
  }

  return result.body.recruit;
}

async function fetchRecruitMessage(interaction, recruitData, messageId) {
  const actualMessageId = recruitData.metadata?.messageId || messageId;
  const recruitId = recruitData.recruitId;

  console.log('[rect-edit] Updated recruit from backend:', {
    recruitId,
    title: recruitData.title,
    description: recruitData.description,
    actualMessageId
  });

  const msg = await interaction.channel.messages.fetch(actualMessageId).catch((err) => {
    console.error('[rect-edit] Failed to fetch message:', err.message);
    return null;
  });

  return { msg, actualMessageId, recruitId };
}

async function buildAndUpdateMessage(msg, recruitData, interaction, recruitId) {
  const participants = normalizeParticipants(recruitData);
  console.log('[rect-edit] Participants:', participants);

  const recruitStyle = await resolveRecruitStyle(recruitData.metadata?.guildId || interaction.guildId);
  console.log('[rect-edit] Recruit style:', recruitStyle);

  const { useColor, accentColor } = resolveAccentColor(recruitData);
  const participantText = buildParticipantText(recruitData, participants);

  const { container, files } = await buildRecruitContainer({
    recruitStyle,
    recruitData,
    participants,
    interaction,
    useColor,
    accentColor,
    participantText,
    recruitId
  });

  console.log('[rect-edit] Updating message');
  await msg.edit({
    files,
    components: [container],
    flags: require('discord.js').MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: [] }
  });
}

async function runUpdateFlow(interaction, messageId, argUpdates) {
  (async () => {
    try {
      const content = interaction.fields.getTextInputValue('content') || null;
      console.log('[rect-edit] Background update started - content:', content);

      const recruitData = await executeRecruitUpdate(interaction, messageId, content, argUpdates);
      if (!recruitData) {
        await interaction.editReply({ content: '⚠️ 募集の更新に失敗しました。' });
        return;
      }

      const { msg, actualMessageId, recruitId } = await fetchRecruitMessage(interaction, recruitData, messageId);

      if (!msg) {
        console.warn('[rect-edit] Message not found:', actualMessageId);
        await interaction.editReply({ content: '✅ 募集を更新しました（メッセージが見つかりません）。' });
        return;
      }

      await buildAndUpdateMessage(msg, recruitData, interaction, recruitId);

      console.log('[rect-edit] Update completed successfully');
      await interaction.editReply({ content: '✅ 募集を更新しました。' });
    } catch (error) {
      console.error('[rect-edit] Background update error', error);
      await interaction.editReply({ content: '❌ 更新に失敗しました。' }).catch(() => {});
    }
  })();
}

function calculateVcValue(recruitData) {
  const hasVoice = recruitData.vc === 'あり' || recruitData.vc === true || recruitData.voice === true;
  const noVoice = recruitData.vc === 'なし' || recruitData.vc === false || recruitData.voice === false;
  
  if (hasVoice) {
    const place = recruitData.metadata?.note || recruitData.voiceChannelName || recruitData.voicePlace;
    return place ? `🎙 あり(${place})` : '🎙 あり';
  } else if (noVoice) {
    return '🎙 なし';
  }
  return null;
}

function buildNotificationRoleText(notificationRoleId) {
  if (!notificationRoleId) return null;
  
  if (notificationRoleId === 'everyone') {
    return '🔔 通知ロール: @everyone';
  } else if (notificationRoleId === 'here') {
    return '🔔 通知ロール: @here';
  } else {
    return `🔔 通知ロール: <@&${notificationRoleId}>`;
  }
}

async function extractUserAvatar(interaction, ownerId) {
  try {
    const fetchedUser = await interaction.client.users.fetch(ownerId).catch(() => null);
    if (fetchedUser && typeof fetchedUser.displayAvatarURL === 'function') {
      return fetchedUser.displayAvatarURL({ size: 128, extension: 'png' });
    }
  } catch (_) {}
  return null;
}

function buildDetailsText(recruitData, participants) {
  const currentMembers = participants.length;
  const maxMembers = Number(recruitData.maxMembers) || currentMembers;

  const startVal = recruitData.metadata?.startLabel || recruitData.startTime
    ? `🕒 ${String(recruitData.metadata?.startLabel || recruitData.startTime)}`
    : null;
  const membersVal = `👥 ${currentMembers}/${maxMembers}人`;
  const vcVal = calculateVcValue(recruitData);

  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  const valuesLine = [startVal, membersVal, vcVal].filter(Boolean).join(' | ');
  return [labelsLine, valuesLine].filter(Boolean).join('\n');
}

function buildRecruitContentText(recruitData) {
  const recruitContent = recruitData.description || recruitData.content || recruitData.note || recruitData.metadata?.raw?.content || '';
  if (recruitContent && String(recruitContent).trim().length > 0) {
    return `**📝 募集内容**\n${String(recruitContent).slice(0, 1500)}`;
  }
  return '';
}

async function buildSimpleRecruitContainer({ recruitData, participants, interaction, accentColor, recruitId }) {
  console.log('[rect-edit] Using simple style (no image)');
  const titleLine = recruitData.title ? `## ${recruitData.title}` : '';
  const detailsText = buildDetailsText(recruitData, participants);
  const contentText = buildRecruitContentText(recruitData);
  
  const notificationRoleId = recruitData.metadata?.notificationRoleId || recruitData.notificationRoleId;
  const subHeaderText = buildNotificationRoleText(notificationRoleId);
  
  const avatarUrl = await extractUserAvatar(interaction, recruitData.ownerId);
  const simpleParticipantText = buildSimpleParticipantText(recruitData, participants);

  return {
    files: [],
    container: buildContainerSimple({
      headerTitle: `${interaction.user.username}さんの募集`,
      titleText: titleLine,
      subHeaderText,
      detailsText,
      contentText,
      participantText: simpleParticipantText,
      recruitIdText: recruitId,
      accentColor,
      avatarUrl
    })
  };
}

async function buildImageRecruitContainer({ recruitData, participants, interaction, useColor, participantText, recruitId, accentColor }) {
  console.log('[rect-edit] Generating recruit card image...');
  const imageBuffer = await generateRecruitCardQueued(recruitData, participants, interaction.client, useColor);
  const image = new AttachmentBuilder(imageBuffer, { name: 'recruit-card.png' });

  console.log('[rect-edit] Building container...');
  return {
    files: [image],
    container: buildContainer({
      headerTitle: `${interaction.user.username}さんの募集`,
      subHeaderText: null,
      contentText: recruitData.description || recruitData.content || '',
      titleText: '',
      participantText,
      recruitIdText: recruitId,
      accentColor,
      imageAttachmentName: 'attachment://recruit-card.png',
      recruiterId: recruitData.ownerId,
      requesterId: interaction.user.id
    })
  };
}

async function buildRecruitContainer({ recruitStyle, recruitData, participants, interaction, useColor, accentColor, participantText, recruitId }) {
  if (recruitStyle === 'simple') {
    return await buildSimpleRecruitContainer({ recruitData, participants, interaction, accentColor, recruitId });
  }

  return await buildImageRecruitContainer({ recruitData, participants, interaction, useColor, participantText, recruitId, accentColor });
}
