const { SlashCommandBuilder } = require('discord.js');

const COLOR_CHOICES = [
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
];

module.exports = {
  noDefer: true,
  data: new SlashCommandBuilder()
    .setName('rect_template')
    .setDescription('保存済みテンプレートから募集を作成します（サブスク向け）')
    .addStringOption(option =>
      option.setName('テンプレート')
        .setDescription('保存済みテンプレート名（必須）')
        .setAutocomplete(true)
        .setRequired(true)
    )
    // Optional overrides
    .addStringOption(option =>
      option.setName('タイトル')
        .setDescription('募集タイトル（任意。未指定ならテンプレート値）')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('人数')
        .setDescription('募集人数（任意）1-16。未指定ならテンプレート値')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(16)
    )
    .addStringOption(option =>
      option.setName('開始時間')
        .setDescription('開始時間（任意）例: 21:00 / 今から。未指定ならテンプレート値')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('色')
        .setDescription('募集パネルの色（任意。未指定ならテンプレート値）')
        .setRequired(false)
        .addChoices(...COLOR_CHOICES)
    )
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
    .addChannelOption(option =>
      option.setName('通話場所')
        .setDescription('通話で使うボイスチャンネル（任意）')
        .addChannelTypes(2, 13)
        .setRequired(false)
    ),
  async execute(interaction) {
    const { execute } = require('./gameRecruit/execute');
    return execute(interaction);
  },

  async autocomplete(interaction) {
    try {
      const templateHasImage = (template) => {
        if (!template || typeof template !== 'object') return false;
        const layout = (template.layout_json && typeof template.layout_json === 'object')
          ? template.layout_json
          : (template.layout && typeof template.layout === 'object')
            ? template.layout
            : null;
        const imageUrl = String(
          template.background_image_url
          || template.backgroundImageUrl
          || layout?.background_image_url
          || layout?.backgroundImageUrl
          || ''
        ).trim();
        const assetKey = String(
          template.background_asset_key
          || template.backgroundAssetKey
          || layout?.background_asset_key
          || layout?.backgroundAssetKey
          || ''
        ).trim();
        return Boolean(imageUrl || assetKey);
      };

      const focused = interaction.options.getFocused(true);
      const focusedName = String(focused?.name || '');
      const focusedValue = String(focused?.value || '').trim();

      if (focusedName === 'テンプレート' || focusedName === 'template') {
        const { listTemplates } = require('../utils/database');
        const backendFetch = require('../utils/common/backendFetch');

        let templates = [];
        try {
          templates = await listTemplates(interaction.guildId, focusedValue || '');
        } catch (_) {
          // fallback below
        }

        if (!Array.isArray(templates) || templates.length === 0) {
          try {
            const params = new URLSearchParams({ guildId: String(interaction.guildId || '') });
            if (focusedValue) params.set('search', focusedValue);
            const resp = await backendFetch(`/api/plus/bot/templates?${params.toString()}`, { method: 'GET' });
            templates = Array.isArray(resp?.templates) ? resp.templates : [];
          } catch (_) {
            templates = [];
          }
        }

        const options = templates
          .filter((t) => t && t.name && templateHasImage(t))
          .slice(0, 25)
          .map((t) => ({ name: String(t.name).slice(0, 100), value: String(t.name).slice(0, 100) }));
        return interaction.respond(options);
      }

      if (focusedName === '開始時間') {
        const v = focusedValue.toLowerCase();
        const shouldSuggest = !v || ['いま', '今', 'ima', 'now'].some((k) => v.includes(k));
        return interaction.respond(shouldSuggest ? [{ name: '今から', value: '今から' }] : []);
      }

      if (focusedName === 'タイトル') {
        const { getGuildSettings } = require('../utils/database');
        const settings = await getGuildSettings(interaction.guildId).catch(() => null);
        const title = settings?.defaultTitle;
        if (title && (!focusedValue || String(title).includes(focusedValue))) {
          return interaction.respond([{ name: `既定: ${String(title).slice(0, 90)}`, value: String(title).slice(0, 100) }]);
        }
      }

      return interaction.respond([]);
    } catch (_) {
      try {
        return await interaction.respond([]);
      } catch (_) {
        return null;
      }
    }
  }
};
