const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { safeReply, safeUpdate } = require('../utils/safeReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('RectBotの使い方とコマンド一覧を表示します')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('特定のコマンドの詳細を表示')
        .addChoices(
          { name: 'rect', value: 'rect' },
          { name: 'setting', value: 'setting' },
          { name: 'help', value: 'help' }
        )
    ),
  async execute(interaction) {
    // ボタンインタラクションの場合はoptionsが存在しないため、スラッシュコマンド以外では全体ヘルプを表示
    const specificCommand = interaction.isChatInputCommand() ? interaction.options.getString('command') : null;
    
    if (specificCommand) {
      // 特定のコマンドの詳細表示
      await showCommandDetails(interaction, specificCommand);
    } else {
      // 全体のヘルプ表示
      await showGeneralHelp(interaction);
    }
  },

  // セレクトメニューのハンドラー
  async handleSelectMenu(interaction) {
    if (interaction.customId !== 'help_command_select') return;
    
    const selectedCommand = interaction.values[0];
    await showCommandDetails(interaction, selectedCommand);
  },

  // ボタンのハンドラー
  async handleButton(interaction) {
    if (interaction.customId !== 'help_back') return;
    
    await showGeneralHelp(interaction);
  }
};

// 全体のヘルプを表示
async function showGeneralHelp(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('🤖 RectBot ヘルプ')
    .setDescription('RectBotの機能一覧です。下のメニューからコマンドを選択すると詳細が表示されます。')
    .addFields(
      { name: '🎮 募集作成', value: '`/rect` - ゲーム募集を作成', inline: true },
      { name: '⚙️ 募集設定', value: '`/setting` - ギルドの募集設定（管理者のみ）', inline: true },
      { name: '❓ ヘルプ', value: '`/help` - このヘルプを表示', inline: true }
    )
    .setFooter({ 
      text: 'RectBot v1.0 | 作成者: RectBot Team',
      iconURL: interaction.client.user.displayAvatarURL()
    })
    .setTimestamp();

  // コマンド選択用のセレクトメニュー
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_command_select')
    .setPlaceholder('コマンドを選んで詳細を確認')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('🎮 rect')
        .setDescription('ゲーム募集を作成する')
        .setValue('rect')
        .setEmoji('🎮'),
      new StringSelectMenuOptionBuilder()
        .setLabel('⚙️ setting')
        .setDescription('ギルドの募集設定を管理する（管理者）')
        .setValue('setting')
        .setEmoji('⚙️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('❓ help')
        .setDescription('このヘルプを表示する')
        .setValue('help')
        .setEmoji('❓')
    ]);

  // ホームページへのボタン
  const homeButton = new ButtonBuilder()
    .setLabel('🏠 ホームページ')
    .setStyle(ButtonStyle.Link)
  .setURL('https://recrubo.net');

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const buttonRow = new ActionRowBuilder().addComponents(homeButton);

  // 応答方法を判定（reply or update）
  if (interaction.isButton()) {
    // ボタンからの操作の場合はupdate
    await safeUpdate(interaction, {
      embeds: [helpEmbed],
      components: [selectRow, buttonRow]
    });
  } else {
    // 最初のコマンド実行の場合はreply
    await safeReply(interaction, {
      embeds: [helpEmbed],
      components: [selectRow, buttonRow],
      flags: MessageFlags.Ephemeral
    });
  }
}

// 特定のコマンドの詳細を表示
async function showCommandDetails(interaction, commandName) {
  const commandDetails = {
    rect: {
      title: '🎮 rect コマンド',
      description: 'ゲーム募集を作成し、参加者を管理できるコマンドです。',
      usage: '`/rect [color]`',
      examples: '`/rect` → モーダルが開き、募集内容を入力',
      fields: [
        { name: '📝 入力項目', value: '• **タイトル**\n• **募集内容**\n• **参加人数**: 1-16人\n• **開始時間**\n• **VC有無**', inline: false },
        { name: '🎯 機能', value: '• 募集カード生成\n• 参加/取り消しボタン\n• 参加者表示の自動更新\n• 自動締切（8時間）', inline: false }
      ]
    },
    setting: {
      title: '⚙️ setting コマンド',
      description: 'ギルド毎の募集設定を管理できるコマンドです（管理者権限が必要）。',
      usage: '`/setting`',
      examples: '`/setting` → 設定UIを表示',
      fields: [
        { name: '🔧 設定項目', value: '• 募集チャンネル\n• 通知ロール\n• 既定タイトル\n• 既定カラー\n• アップデート通知チャンネル', inline: false },
        { name: '👤 権限', value: 'このコマンドは管理者のみ実行できます', inline: false }
      ]
    },
    help: {
      title: '❓ help コマンド',
      description: 'RectBotの使い方とコマンド一覧を表示するコマンドです。',
      usage: '`/help [command]`',
      examples: '`/help` → 全体ヘルプ\n`/help rect` → rectコマンドの詳細',
      fields: [
        { name: '📖 オプション', value: '• **command**: 特定のコマンドの詳細を表示（省略可）', inline: false },
        { name: '💡 使い方', value: '• `/help` で全体のヘルプ表示\n• `/help [コマンド名]` で個別詳細表示\n• セレクトメニューからも選択可能', inline: false }
      ]
    }
  };

  const command = commandDetails[commandName];
  if (!command) {
    await interaction.reply({
      content: '❌ 指定されたコマンドが見つかりません。',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const detailEmbed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(command.title)
    .setDescription(command.description)
    .addFields(
      { name: '📝 使用方法', value: command.usage, inline: true },
      { name: '💡 例', value: command.examples, inline: true },
      { name: '\u200B', value: '\u200B', inline: false }, // 空行
      ...command.fields
    )
    .setFooter({ 
      text: 'RectBot ヘルプ | /help で戻る',
      iconURL: interaction.client.user.displayAvatarURL()
    })
    .setTimestamp();

  // 戻るボタンとホームページボタン
  const backButton = new ButtonBuilder()
    .setCustomId('help_back')
    .setLabel('⬅️ 戻る')
    .setStyle(ButtonStyle.Secondary);

  const homeButton = new ButtonBuilder()
    .setLabel('🏠 ホームページ')
    .setStyle(ButtonStyle.Link)
  .setURL('https://recrubo.net');

  const buttonRow = new ActionRowBuilder().addComponents(backButton, homeButton);

  // 応答方法を判定（reply or update）
  if (interaction.isStringSelectMenu() || interaction.isButton()) {
    // セレクトメニューやボタンからの操作の場合はupdate
    await interaction.update({
      embeds: [detailEmbed],
      components: [buttonRow]
    });
  } else {
    // 最初のコマンド実行の場合はreply
    await interaction.reply({
      embeds: [detailEmbed],
      components: [buttonRow],
      flags: MessageFlags.Ephemeral
    });
  }
}