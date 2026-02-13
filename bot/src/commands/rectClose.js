const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { listRecruitsFromRedis, getParticipantsFromRedis } = require('../utils/db');
const { autoCloseRecruitment } = require('../utils/recruitMessage');
const { safeReply } = require('../utils/safeReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rect_close')
    .setDescription('既存の募集を参加者が締める（〆）')
    .addStringOption(option =>
      option.setName('募集')
        .setDescription('締める募集を選択')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  noDefer: false,

  async autocomplete(interaction) {
    try {
      const all = await listRecruitsFromRedis().catch(() => []);
      const guildId = interaction.guildId;
      
      // 現在のユーザーが参加している募集のみをフィルタ
      const userRecruits = [];
      for (const r of all || []) {
        try {
          const gid = String(r?.guildId ?? r?.guild_id ?? r?.metadata?.guildId ?? '');
          const status = String(r?.status ?? '').toLowerCase();
          if (gid !== String(guildId)) continue;
          if (status && !(status === 'recruiting' || status === 'active')) continue;
          
          const messageId = String(r?.message_id || r?.messageId || r?.metadata?.messageId || '');
          if (!messageId) continue;
          
          // 参加者チェック
          const participants = await getParticipantsFromRedis(messageId).catch(() => []);
          if (!Array.isArray(participants) || !participants.includes(interaction.user.id)) continue;
          
          const label = (r?.title ? String(r.title).slice(0, 80) : '募集') + ` (ID: ${String(r?.recruitId || '').slice(0,8)})`;
          userRecruits.push({
            name: label,
            value: messageId
          });
        } catch (_) {}
      }
      
      await interaction.respond(userRecruits.slice(0, 25));
    } catch (err) {
      console.error('[rect-close autocomplete]', err);
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction) {
    const messageId = interaction.options.getString('募集');
    if (!messageId) {
      await safeReply(interaction, { content: '❌ 募集が選択されていません。', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      // 参加者取得
      let participants = await getParticipantsFromRedis(messageId).catch(() => null);
      if (!Array.isArray(participants)) participants = [];

      const isParticipant = participants.includes(interaction.user.id);
      if (!isParticipant) {
        await safeReply(interaction, { content: '❌ この募集の参加者のみが〆できます。', flags: MessageFlags.Ephemeral });
        return;
      }

      // 募集情報取得（タイトル表示用）
      let recruitTitle = '募集';
      try {
        const all = await listRecruitsFromRedis().catch(() => []);
        const target = (all || []).find(r => 
          String(r?.message_id || r?.messageId || '') === messageId || 
          String(r?.recruitId || '') === messageId.slice(-8)
        );
        if (target && target.title) {
          recruitTitle = String(target.title).slice(0, 100);
        }
      } catch (_) {}

      // 対象募集のチャンネルIDを取得
      let channelId = interaction.channelId;
      try {
        const all = await listRecruitsFromRedis().catch(() => []);
        const target = (all || []).find(r => 
          String(r?.message_id || r?.messageId || '') === messageId || 
          String(r?.recruitId || '') === messageId.slice(-8)
        );
        if (target && (target.channelId || target.metadata?.channelId)) {
          channelId = String(target.channelId || target.metadata.channelId);
        }
      } catch (_) {}

      // クローズ実行
      await autoCloseRecruitment(interaction.client, interaction.guildId, channelId, messageId);
      
      await safeReply(interaction, { 
        content: `🔒 **${recruitTitle}** の募集を締めました。`, 
        flags: MessageFlags.Ephemeral 
      });
    } catch (err) {
      console.error('[rect-close execute]', err);
      await safeReply(interaction, { 
        content: `❌ 〆処理中にエラーが発生しました: ${err?.message || err}`, 
        flags: MessageFlags.Ephemeral 
      });
    }
  }
};
