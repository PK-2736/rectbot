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
    const rectCommand = require('./gameRecruit');
    if (rectCommand?.autocomplete) {
      return rectCommand.autocomplete(interaction);
    }
    return interaction.respond([]);
  }
};
