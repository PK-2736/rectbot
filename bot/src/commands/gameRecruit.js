const { SlashCommandBuilder } = require('discord.js');
// externalized shared state and helpers
const { recruitParticipants, __hydrateParticipants } = require('./gameRecruit/data/state');
const { autoCloseRecruitment } = require('../utils/recruitMessage');
const { listTemplates, getGuildSettings } = require('../utils/database');
const backendFetch = require('../utils/common/backendFetch');

async function listTemplateCandidates(guildId, search) {
  const query = String(search || '').trim();

  // 1) Bot直結のDBを最初に試行
  try {
    const local = await listTemplates(guildId, query);
    if (Array.isArray(local) && local.length > 0) {
      return local;
    }
  } catch (e) {
    console.warn('[rect autocomplete] local listTemplates failed:', e?.message || e);
  }

  // 2) フォールバック: Worker内部API
  try {
    const params = new URLSearchParams({ guildId: String(guildId || '') });
    if (query) params.set('search', query);
    const resp = await backendFetch(`/api/plus/bot/templates?${params.toString()}`, { method: 'GET' });
    return Array.isArray(resp?.templates) ? resp.templates : [];
  } catch (e) {
    console.warn('[rect autocomplete] backend template list failed:', e?.message || e);
    return [];
  }
}

// hydrateRecruitData moved to utils/recruitMessage

// autoCloseRecruitment moved to utils/recruitMessage

// safeReply moved to ../utils/safeReply

// Redis専用 募集データAPI
const { saveRecruitToRedis, getRecruitFromRedis, listRecruitsFromRedis } = require('../utils/database');

// updateParticipantList moved to ../utils/recruitMessage

module.exports = {
  // export in-memory map and hydration helper so index.js can hydrate on startup
  recruitParticipants,
  __hydrateParticipants,
  autoCloseRecruitment,
  // このコマンドは初手でモーダルを表示するため、deferReplyを行わない
  noDefer: true,
  // 指定メッセージIDの募集データをRedisから取得
  async getRecruitData(messageId) {
    const recruit = await getRecruitFromRedis(messageId.slice(-8));
    if (!recruit) return null;
    return recruit;
  },
  // 指定メッセージIDの募集データをRedisで更新
  async updateRecruitData(messageId, newRecruitData) {
    if (!newRecruitData.recruitId) {
      newRecruitData.recruitId = messageId.slice(-8);
    }
    await saveRecruitToRedis(newRecruitData.recruitId, newRecruitData);
    return newRecruitData;
  },
  data: new SlashCommandBuilder()
    .setName('rect')
    .setDescription('ゲーム募集を作成します（/rect）')
    // 必須: 募集タイトル（必須は任意より前に定義する必要あり）
    .addStringOption(option =>
      option.setName('タイトル')
        .setDescription('募集タイトル（必須）')
        .setRequired(true)
        .setAutocomplete(true)
    )
    // 必須: 募集人数
    .addIntegerOption(option =>
      option.setName('人数')
        .setDescription('募集人数（必須）1-16')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(16)
    )
    // 必須: 開始時間（HH:mm 24時間表記 or 「今から」）
    .addStringOption(option =>
      option.setName('開始時間')
        .setDescription('開始時間（必須）例: 21:00（24時間表記）／ 今から（候補から選択可）')
        .setRequired(true)
        .setAutocomplete(true)
    )
    // 任意: 保存済みテンプレート
    .addStringOption(option =>
      option.setName('テンプレート')
        .setDescription('保存済み募集テンプレート（任意）')
        .setRequired(false)
        .setAutocomplete(true)
    )
    // 任意: 色
    .addStringOption(option =>
      option.setName('色')
        .setDescription('募集パネルの色を選択（任意）')
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
    )
    // 任意: 通話の有無（あり/なし/あり(聞き専)）
    .addStringOption(option =>
      option.setName('通話有無')
        .setDescription('通話の有無（任意）')
        .setRequired(false)
        .addChoices(
          { name: 'あり', value: 'あり' },
          { name: 'なし', value: 'なし' },
          { name: 'あり(聞き専)', value: 'あり(聞き専)' }
        )
    )
    // 任意: 通話場所（サーバーのボイスチャンネル）
    .addChannelOption(option =>
      option.setName('通話場所')
        .setDescription('通話で使うボイスチャンネル（任意）')
        .addChannelTypes(2, 13) // GuildVoice=2, GuildStageVoice=13
        .setRequired(false)
    ),
  async execute(interaction) {
    // Delegate to extracted handler
    const { execute } = require('./gameRecruit/execute');
    return execute(interaction);
  },

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      const focusedName = String(focused?.name || '');
      const focusedValue = String(focused?.value || '').trim();

      if (focusedName === 'テンプレート' || focusedName === 'template') {
        const templates = await listTemplateCandidates(interaction.guildId, focusedValue || '');
        const options = (Array.isArray(templates) ? templates : [])
          .filter((t) => t && t.name)
          .slice(0, 25)
          .map((t) => ({
            name: String(t.name).slice(0, 100),
            value: String(t.name).slice(0, 100),
          }));
        await interaction.respond(options);
        return;
      }

      if (focusedName === 'タイトル' || focusedName === 'title') {
        const settings = await getGuildSettings(interaction.guildId).catch(() => null);
        const title = settings?.defaultTitle;
        if (title && (!focusedValue || String(title).includes(focusedValue))) {
          await interaction.respond([{ name: `既定: ${String(title).slice(0, 90)}`, value: String(title).slice(0, 100) }]);
          return;
        }
        await interaction.respond([]);
        return;
      }

      if (focusedName === '開始時間' || focusedName === 'start') {
        const v = focusedValue.toLowerCase();
        const shouldSuggest = !v || ['いま', '今', 'ima', 'now'].some((k) => v.includes(k));
        await interaction.respond(shouldSuggest ? [{ name: '今から', value: '今から' }] : []);
        return;
      }

      await interaction.respond([]);
    } catch (error) {
      console.warn('[rect autocomplete] error:', error?.message || error);
      try {
        await interaction.respond([]);
      } catch (_) {}
    }
  },

  // モーダル送信後の処理（interactionCreateイベントで呼び出し）
  async handleModalSubmit(interaction) {
    // Delegate to extracted handler
    const { handleModalSubmit } = require('./gameRecruit/handlers');
    return handleModalSubmit(interaction);
  },

  // ボタンインタラクションの処理
  async handleButton(interaction) {
    // Delegate to extracted handler
    const { handleButton } = require('./gameRecruit/handlers');
    return handleButton(interaction);
  },



  // 全募集データをRedisから取得する関数
  async getAllRecruitData() {
    const recruits = await listRecruitsFromRedis();
    const result = {};
    for (const recruit of recruits) {
      if (recruit && recruit.recruitId) {
        result[recruit.message_id || recruit.recruitId] = recruit;
      }
    }
    return result;
  },
}
