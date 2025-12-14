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
    .addStringOption(o => o.setName('id').setDescription('募集ID（パネル下部の8桁）').setRequired(true))
    .addStringOption(o => o.setName('タイトル').setDescription('新しいタイトル').setRequired(false))
    .addIntegerOption(o => o.setName('人数').setDescription('参加人数').setRequired(false))
    .addStringOption(o => o.setName('開始時間').setDescription('開始時間（例: 今から/21:00）').setRequired(false))
    .addStringOption(o => o.setName('通話有無').setDescription('あり/なし').setRequired(false))
    .addStringOption(o => o.setName('通話場所').setDescription('VCチャンネル名など').setRequired(false)),

  async execute(interaction) {
    const recruitId = interaction.options.getString('id');
    const preset = {
      title: interaction.options.getString('タイトル') || '',
      participants: interaction.options.getInteger('人数') || '',
      startTime: interaction.options.getString('開始時間') || '',
      vc: interaction.options.getString('通話有無') || '',
      place: interaction.options.getString('通話場所') || ''
    };

    try {
      // Defer first to get interaction into safe state, then showModal
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
      }

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

      // Modal
      const modal = new ModalBuilder().setCustomId(`rectEditModal_${messageId}`).setTitle('募集編集');
      const titleInput = new TextInputBuilder().setCustomId('title').setLabel('タイトル').setStyle(TextInputStyle.Short).setRequired(false).setValue(preset.title || (recruit.title || ''));
      const peopleInput = new TextInputBuilder().setCustomId('participants').setLabel('参加人数').setStyle(TextInputStyle.Short).setRequired(false).setValue(preset.participants ? String(preset.participants) : String(recruit.maxMembers || ''));
      const startInput = new TextInputBuilder().setCustomId('startTime').setLabel('開始時間').setStyle(TextInputStyle.Short).setRequired(false).setValue(preset.startTime || (recruit.startTime || ''));
      const vcInput = new TextInputBuilder().setCustomId('vc').setLabel('VC有無（あり/なし）').setStyle(TextInputStyle.Short).setRequired(false).setValue(preset.vc || ((recruit.voice ? 'あり' : 'なし')));
      const placeInput = new TextInputBuilder().setCustomId('place').setLabel('通話場所（任意）').setStyle(TextInputStyle.Short).setRequired(false).setValue(preset.place || (recruit.metadata?.raw?.voiceChannelName || ''));

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(peopleInput),
        new ActionRowBuilder().addComponents(startInput),
        new ActionRowBuilder().addComponents(vcInput),
        new ActionRowBuilder().addComponents(placeInput),
      );

      await interaction.showModal(modal);
    } catch (error) {
      console.error('[rect-edit] fetch or modal error', error);
      await safeRespond(interaction, { content: '❌ 募集が見つかりませんでした。', flags: MessageFlags.Ephemeral });
    }
  },

  async handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith('rectEditModal_')) return;
    const messageId = interaction.customId.replace('rectEditModal_', '');
    try {
      const title = interaction.fields.getTextInputValue('title') || null;
      const participants = interaction.fields.getTextInputValue('participants') || null;
      const startTime = interaction.fields.getTextInputValue('startTime') || null;
      const vc = interaction.fields.getTextInputValue('vc') || null;
      const place = interaction.fields.getTextInputValue('place') || null;

      const update = {
        title: title || undefined,
        participants: participants ? parseInt(participants, 10) : undefined,
        startTime: startTime || undefined,
        vc: vc || undefined,
        note: place || undefined,
      };

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
