const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { normalizeGameNameWithWorker, validateFriendCodeWithWorker, addFriendCodeToWorker } = require('../utils/workerApiClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id_add')
    .setDescription('フレンドコードを登録します'),

  noDefer: true, // モーダル表示のためdeferReplyを行わない

  async execute(interaction) {
    await interaction.showModal(buildFriendCodeModal());
  },

  async handleModalSubmit(interaction) {
    await interaction.deferReply({ flags: 64 }); // 64 = Ephemeral

    try {
      const input = readModalInput(interaction);
      const result = await runFriendCodeFlow(interaction, input);
      await interaction.editReply({ content: result.message });
    } catch (error) {
      console.error('[link-add] Error:', error);
      await interaction.editReply({
        content: '❌ フレンドコードの登録中にエラーが発生しました。\nWorker APIに接続できない可能性があります。'
      });
    }
  }
};

function buildFriendCodeModal() {
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

  modal.addComponents(
    new ActionRowBuilder().addComponents(gameNameInput),
    new ActionRowBuilder().addComponents(friendCodeInput)
  );

  return modal;
}

function readModalInput(interaction) {
  return {
    gameNameInput: interaction.fields.getTextInputValue('game_name'),
    friendCode: interaction.fields.getTextInputValue('friend_code'),
    userId: interaction.user.id,
    guildId: interaction.guild.id
  };
}

async function runFriendCodeFlow(interaction, input) {
  await interaction.editReply({ content: '🤖 AIがゲーム名を判定中...' });
  const normalizedResult = await normalizeGameNameWithWorker(input.gameNameInput, input.userId, input.guildId);

  if (!normalizedResult.normalized) {
    return { message: '❌ ゲーム名を認識できませんでした。もう一度お試しください。' };
  }

  await interaction.editReply({ content: '🔍 AIがフレンドコード/IDを検証中...' });
  const validation = await validateFriendCodeWithWorker(normalizedResult.normalized, input.friendCode);

  if (!validation.isValid) {
    return { message: buildValidationErrorMessage(normalizedResult.normalized, input.friendCode, validation) };
  }

  await addFriendCodeToWorker(input.userId, input.guildId, normalizedResult.normalized, input.friendCode, input.gameNameInput);

  return { message: buildSuccessMessage(input, normalizedResult, validation) };
}

function buildValidationErrorMessage(normalized, friendCode, validation) {
  let errorMessage = `❌ **${normalized}** のフレンドコード/IDの形式が正しくない可能性があります。\n\n`;
  errorMessage += `**入力値:** \`${friendCode}\`\n`;
  errorMessage += `**理由:** ${validation.message}\n`;

  if (validation.suggestions && validation.suggestions.length > 0) {
    errorMessage += `\n**ヒント:**\n${validation.suggestions.map(s => `• ${s}`).join('\n')}`;
  }

  errorMessage += `\n\n信頼度: ${(validation.confidence * 100).toFixed(0)}%`;
  errorMessage += `\n\n本当に登録する場合は、もう一度コマンドを実行してください。`;
  return errorMessage;
}

function buildSuccessMessage(input, result) {
  const { gameNameInput, friendCode } = input;
  const normalized = result.normalized;
  const confidence = result.confidence;
  let message = `✅ **${normalized}** のフレンドコードを登録しました！\n\`\`\`${friendCode}\`\``;

  if (result.method === 'ai') {
    message += `\n\n🤖 AI判定: 「${gameNameInput}」→「${normalized}」`;

    if (confidence < 0.9) {
      message += `\n信頼度: ${(confidence * 100).toFixed(0)}%`;
    }

    if (result.matches && result.matches.length > 1) {
      const alternatives = result.matches.slice(1, 3).map(m => m.gameName).join(', ');
      message += `\n\n類似ゲーム: ${alternatives}`;
    }
  } else if (result.method === 'cache') {
    message += '\n\n💾 キャッシュから取得';
  }

  return message;
}
