const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js');

const { updateRecruitmentData, getRecruitFromRedis } = require('../utils/db');
const { safeRespond } = require('../utils/interactionHandler');
const { getActiveRecruits } = require('../utils/db/statusApi');
const { generateRecruitCard } = require('../utils/canvasRecruit');
const { buildContainer, buildContainerSimple } = require('../utils/recruitHelpers');
const { getParticipantsFromRedis } = require('../utils/db');
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

module.exports = {
  noDefer: true,
  data: new SlashCommandBuilder()
    .setName('rect-edit')
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
    .addBooleanOption(o => o.setName('通話有無').setDescription('通話の有無').setRequired(false))
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

  async execute(interaction) {
    const recruitId = interaction.options.getString('id');
    console.log(`[rect-edit] execute called with recruitId: ${recruitId}`);
    if (recruitId === 'NO_ACTIVE') {
      await safeRespond(interaction, { content: '❌ 編集できる募集がありません。', flags: MessageFlags.Ephemeral });
      return;
    }

    // Get all options from arguments
    const argUpdates = {};
    const titleArg = interaction.options.getString('タイトル');
    const peopleArg = interaction.options.getInteger('人数');
    const startArg = interaction.options.getString('開始時間');
    const vcArg = interaction.options.getBoolean('通話有無');
    const placeArg = interaction.options.getChannel('通話場所');
    const colorArg = interaction.options.getString('色');

    if (titleArg) argUpdates.title = titleArg;
    if (peopleArg) argUpdates.participants = peopleArg;
    if (startArg) argUpdates.startTime = startArg;
    if (vcArg !== null) argUpdates.vc = vcArg;
    if (placeArg) argUpdates.voiceChannel = { id: placeArg.id, name: placeArg.name };
    if (colorArg) argUpdates.panelColor = colorArg;

    console.log(`[rect-edit] argUpdates:`, argUpdates);

    try {
      // DO NOT defer - showModal must be the first response
      const recruit = await fetchRecruitById(recruitId);
      console.log(`[rect-edit] recruit fetched:`, { id: recruit?.recruitId || recruit?.id, title: recruit?.title });
      const ownerId = recruit?.ownerId || recruit?.metadata?.raw?.recruiterId;
      const messageId = recruit?.metadata?.messageId;
      if (!ownerId || !messageId) {
        await safeRespond(interaction, { content: '❌ 募集の取得に失敗しました。', flags: MessageFlags.Ephemeral });
        return;
      }
      if (String(ownerId) !== interaction.user.id) {
        await safeRespond(interaction, { content: '❌ 募集主のみが編集できます。', flags: MessageFlags.Ephemeral });
        return;
      }

      // Always show modal with preset values from arguments
      const modal = new ModalBuilder()
        .setCustomId(`rectEditModal_${messageId}_${JSON.stringify(argUpdates)}`)
        .setTitle('募集内容編集');
      
      const contentInput = new TextInputBuilder()
        .setCustomId('content')
        .setLabel('募集内容')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000)
        .setValue(recruit.description || recruit.content || '');

      modal.addComponents(new ActionRowBuilder().addComponents(contentInput));
      await interaction.showModal(modal);
    } catch (error) {
      console.error('[rect-edit] fetch or modal error', error);
      // Only respond if we haven't shown the modal yet
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ 募集が見つかりませんでした。', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },

  async autocomplete(interaction) {
    const focusedName = interaction.options.getFocused(true)?.name;
    
    // 開始時間のオートコンプリート
    if (focusedName === '開始時間') {
      const focused = (interaction.options.getFocused() || '').trim();
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
      return;
    }

    // 募集IDのオートコンプリート
    try {
      const focused = (interaction.options.getFocused() || '').trim();
      const guildId = interaction.guild?.id;
      const userId = interaction.user?.id;
      const res = await getActiveRecruits();
      const list = Array.isArray(res?.body) ? res.body : [];
      console.log(`[rect-edit autocomplete] Found ${list.length} total recruits`);
      const filtered = list
        .filter(r => (r.status || 'recruiting') === 'recruiting')
        .filter(r => !guildId || r.metadata?.guildId === guildId)
        .filter(r => !userId || String(r.ownerId || r.owner_id) === String(userId))
        .map(r => ({
          id: r.recruitId || r.id,
          title: r.title || r.game || '募集',
          start: r.startTime || r.metadata?.startLabel || '',
          voice: r.voice,
          guildId: r.metadata?.guildId,
        }));

      console.log(`[rect-edit autocomplete] After filtering: ${filtered.length} recruits`, filtered.map(r => r.id));

      const options = filtered
        .filter(r => !focused || String(r.id).includes(focused) || (r.title && r.title.includes(focused)))
        .slice(0, 25)
        .map(r => ({
          name: `${r.title} | ${r.start || ''} | ${r.id}`.slice(0, 100),
          value: String(r.id).slice(-100)
        }));

      console.log(`[rect-edit autocomplete] Responding with ${options.length} options`, options.map(o => o.value));

      if (options.length === 0) {
        await interaction.respond([{ name: 'アクティブな募集なし', value: 'NO_ACTIVE' }]);
      } else {
        await interaction.respond(options);
      }
    } catch (err) {
      console.error('[rect-edit] autocomplete error', err);
      try { await interaction.respond([]); } catch (_) { /* ignore */ }
    }
  },

  async handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith('rectEditModal_')) return;
    const parts = interaction.customId.replace('rectEditModal_', '').split('_');
    const messageId = parts[0];
    let argUpdates = {};
    try {
      if (parts[1]) {
        argUpdates = JSON.parse(parts.slice(1).join('_'));
      }
    } catch (e) {
      console.warn('[rect-edit] Failed to parse argUpdates from customId', e);
    }

    try {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ content: '⏳ 募集を更新中...' });

      // Run update process in background without awaiting
      (async () => {
        try {
          const content = interaction.fields.getTextInputValue('content') || null;
          console.log('[rect-edit] Background update started - content:', content);

          const update = {
            // Always send content, even if it's just the current description
            description: content !== null ? content : undefined,
            content: content !== null ? content : undefined,
          };
          
          // Add argument-based updates if they exist
          if (argUpdates.title) update.title = argUpdates.title;
          if (argUpdates.participants) update.participants = argUpdates.participants;
          if (argUpdates.startTime) update.startTime = argUpdates.startTime;
          if (argUpdates.vc !== undefined) update.vc = argUpdates.vc;
          if (argUpdates.voiceChannel?.name) update.note = argUpdates.voiceChannel.name;
          if (argUpdates.panelColor) update.panelColor = argUpdates.panelColor;

          console.log('[rect-edit] handleModalSubmit - messageId:', messageId);
          console.log('[rect-edit] Updating recruit with:', update);
          
          // updateRecruitmentData expects messageId as first parameter
          const result = await updateRecruitmentData(messageId, update);
          console.log('[rect-edit] updateRecruitmentData result:', { ok: result.ok, status: result.status });

          // Extract recruitId from the response or derive it from messageId
          let recruitId = null;
          if (result.ok && result.body?.recruit?.recruitId) {
            recruitId = result.body.recruit.recruitId;
            console.log('[rect-edit] Got recruitId from response:', recruitId);
          } else if (result.body?.recruitId) {
            recruitId = result.body.recruitId;
            console.log('[rect-edit] Got recruitId from body:', recruitId);
          } else {
            // Fallback: extract last 8 digits from messageId
            recruitId = String(messageId).slice(-8);
            console.log('[rect-edit] Extracted recruitId from messageId:', recruitId);
          }

          // Fetch updated recruit data using recruitId
          const recruitData = await getRecruitFromRedis(recruitId);
          console.log('[rect-edit] Fetched updated recruit:', recruitData);

          if (!recruitData) {
            await interaction.editReply({ content: '⚠️ 募集を更新しましたが、表示の更新に失敗しました。' });
            return;
          }

          const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
          if (!msg) {
            await interaction.editReply({ content: '✅ 募集を更新しました（メッセージが見つかりません）。' });
            return;
          }

          // Get participants using recruitId
          const participants = await getParticipantsFromRedis(recruitId).catch(() => []);
          
          // Regenerate image and container
          const useColor = recruitData.panelColor || '000000';
          const accentColor = /^[0-9A-Fa-f]{6}$/.test(useColor) ? parseInt(useColor, 16) : 0x000000;
          
          console.log('[rect-edit] Generating recruit card image...');
          const imageBuffer = await generateRecruitCard(recruitData, participants, interaction.client, useColor);
          const image = new AttachmentBuilder(imageBuffer, { name: 'recruit-card.png' });

          const participantText = participants.length > 0 
            ? `🎯✨ 参加リスト ✨🎯\n${participants.map(id => `🎮 <@${id}>`).join('\n')}`
            : `🎯✨ 参加リスト ✨🎯\n🎮 <@${recruitData.recruiterId}>`;

          console.log('[rect-edit] Building container...');
          const container = buildContainer({
            headerTitle: `${interaction.user.username}さんの募集`,
            subHeaderText: null,
            contentText: recruitData.content || recruitData.note || '',
            titleText: '',
            participantText,
            recruitIdText: messageId,
            accentColor,
            imageAttachmentName: 'attachment://recruit-card.png',
            recruiterId: recruitData.recruiterId,
            requesterId: interaction.user.id
          });

          console.log('[rect-edit] Updating message...');
          await msg.edit({
            files: [image],
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { roles: [], users: [] }
          });

          console.log('[rect-edit] Update completed successfully');
          await interaction.editReply({ content: '✅ 募集を更新しました。' });
        } catch (error) {
          console.error('[rect-edit] Background update error', error);
          await interaction.editReply({ content: '❌ 更新に失敗しました。' }).catch(() => {});
        }
      })();
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
