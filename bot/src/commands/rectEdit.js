const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');

const { updateRecruitmentData } = require('../utils/db');
const { safeRespond } = require('../utils/interactionHandler');
const { getActiveRecruits } = require('../utils/db/statusApi');
const backendFetch = require('../utils/backendFetch');
const config = require('../config');

async function fetchRecruitById(recruitId) {
  const base = config.BACKEND_API_URL.replace(/\/$/, '');
  // Try plural first, then singular path
  try {
    const body = await backendFetch(`${base}/api/recruits/${encodeURIComponent(recruitId)}`);
    return body;
  } catch (e1) {
    try {
      const body = await backendFetch(`${base}/api/recruitment/${encodeURIComponent(recruitId)}`);
      return body;
    } catch (e2) {
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

    try {
      // DO NOT defer - showModal must be the first response
      const recruit = await fetchRecruitById(recruitId);
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

      // If only arguments provided, update directly without modal
      if (Object.keys(argUpdates).length > 0 && !interaction.options.data.some(o => o.name === 'content')) {
        await interaction.deferReply({ ephemeral: true });
        
        const update = {
          title: argUpdates.title,
          participants: argUpdates.participants,
          startTime: argUpdates.startTime,
          vc: argUpdates.vc,
          note: argUpdates.voiceChannel?.name,
        };
        if (argUpdates.panelColor) {
          update.panelColor = argUpdates.panelColor;
        }

        await updateRecruitmentData(messageId, update);

        const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
        if (msg) {
          await msg.edit({
            components: msg.components,
            flags: MessageFlags.IsComponentsV2,
          });
        }

        await interaction.editReply({ content: '✅ 募集を更新しました。' });
        return;
      }

      // Show modal for content editing
      const modal = new ModalBuilder().setCustomId(`rectEditModal_${messageId}_${JSON.stringify(argUpdates)}`).setTitle('募集内容編集');
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

      const options = filtered
        .filter(r => !focused || String(r.id).includes(focused) || (r.title && r.title.includes(focused)))
        .slice(0, 25)
        .map(r => ({
          name: `${r.title} | ${r.start || ''} | ${r.id}`.slice(0, 100),
          value: String(r.id).slice(-100)
        }));

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
      const content = interaction.fields.getTextInputValue('content') || null;

      const update = {
        description: content || undefined,
        title: argUpdates.title || undefined,
        participants: argUpdates.participants || undefined,
        startTime: argUpdates.startTime || undefined,
        vc: argUpdates.vc !== undefined ? argUpdates.vc : undefined,
        note: argUpdates.voiceChannel?.name || undefined,
      };
      if (argUpdates.panelColor) {
        update.panelColor = argUpdates.panelColor;
      }

      await updateRecruitmentData(messageId, update);

      // メッセージを軽く編集（募集ID表示は維持）
      const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        await msg.edit({
          components: msg.components,
          flags: MessageFlags.IsComponentsV2,
        });
      }

      await safeRespond(interaction, { content: '✅ 募集を更新しました。', flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('[rect-edit] update error', error);
      await safeRespond(interaction, { content: '❌ 更新に失敗しました。', flags: MessageFlags.Ephemeral });
    }
  }
};
