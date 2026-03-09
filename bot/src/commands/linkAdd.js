const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { validateFriendCodeWithWorker, addFriendCodeToWorker } = require('../utils/workerApiClient');

const GAME_META_PREFIX = '__GAME_META__:';

function parseTriggerWords(input, gameName) {
  const raw = String(input || '').trim();
  if (!raw) return [];

  const parts = raw
    .split(/\n+/)
    .map(s => String(s || '').trim())
    .filter(Boolean)
    .slice(0, 20);

  const seen = new Set();
  const gameLower = String(gameName || '').toLowerCase();
  const result = [];
  for (const word of parts) {
    const lower = word.toLowerCase();
    if (lower === gameLower || seen.has(lower)) continue;
    seen.add(lower);
    result.push(word);
  }
  return result;
}

function serializeOriginalGameName(gameName, triggerWords) {
  if (!Array.isArray(triggerWords) || triggerWords.length === 0) {
    return gameName;
  }
  return `${GAME_META_PREFIX}${JSON.stringify({ name: gameName, triggerWords })}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id_add')
    .setDescription('フレンドコードを登録します'),

  noDefer: true, // モーダル表示のためdeferReplyを行わない

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('friend_code_add_modal')
      .setTitle('フレンドコード登録');

    const gameNameInput = new TextInputBuilder()
      .setCustomId('game_name')
      .setLabel('ゲーム名')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: Valorant, Apex, マイクラ, valo, えぺ')
      .setRequired(true)
      .setMaxLength(50);

    const friendCodeInput = new TextInputBuilder()
      .setCustomId('friend_code')
      .setLabel('フレンドコード / ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: Player#1234, SW-0000-0000-0000')
      .setRequired(true)
      .setMaxLength(100);

    const triggerWordsInput = new TextInputBuilder()
      .setCustomId('trigger_words')
      .setLabel('反応ワード（任意・複数可）')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('例:\nえぺ\napex\napex legends\n（改行区切り）')
      .setRequired(false)
      .setMaxLength(300);

    modal.addComponents(
      new ActionRowBuilder().addComponents(gameNameInput),
      new ActionRowBuilder().addComponents(friendCodeInput),
      new ActionRowBuilder().addComponents(triggerWordsInput)
    );

    await interaction.showModal(modal);
  },

  async handleModalSubmit(interaction) {
    await interaction.deferReply({ flags: 64 }); // 64 = Ephemeral

    try {
      const gameNameInput = interaction.fields.getTextInputValue('game_name');
      const gameName = String(gameNameInput || '').trim();
      const friendCode = interaction.fields.getTextInputValue('friend_code');
      const triggerWordsInput = interaction.fields.getTextInputValue('trigger_words');
      const triggerWords = parseTriggerWords(triggerWordsInput, gameName);
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

      if (!gameName) {
        return interaction.editReply({
          content: '❌ ゲーム名を入力してください。'
        });
      }

      // フレンドコード/IDを検証
      await interaction.editReply({ content: '🔍 フレンドコード/IDを検証中...' });

      const validation = await validateFriendCodeWithWorker(gameName, friendCode);

      if (!validation.isValid) {
        let errorMessage = `❌ **${gameName}** のフレンドコード/IDの形式が正しくない可能性があります。\n\n`;
        errorMessage += `**入力値:** \`${friendCode}\`\n`;
        errorMessage += `**理由:** ${validation.message}\n`;

        if (validation.suggestions && validation.suggestions.length > 0) {
          errorMessage += `\n**ヒント:**\n${validation.suggestions.map(s => `• ${s}`).join('\n')}`;
        }

        errorMessage += `\n\n信頼度: ${(validation.confidence * 100).toFixed(0)}%`;
        errorMessage += `\n\n本当に登録する場合は、もう一度コマンドを実行してください。`;

        return interaction.editReply({ content: errorMessage });
      }

      // Worker API 経由で D1 に保存
      const originalGameName = serializeOriginalGameName(gameName, triggerWords);
      await addFriendCodeToWorker(userId, guildId, gameName, friendCode, originalGameName);

      // 結果メッセージ
      let message = `✅ **${gameName}** のフレンドコードを登録しました！\n\`\`\`${friendCode}\`\`\``;
      if (triggerWords.length > 0) {
        message += `\n\n🔔 反応ワード: ${triggerWords.join(', ')}`;
      }

      await interaction.editReply({ content: message });

    } catch (error) {
      console.error('[link-add] Error:', error);
      await interaction.editReply({
        content: '❌ フレンドコードの登録中にエラーが発生しました。\nWorker APIに接続できない可能性があります。'
      });
    }
  }
};
