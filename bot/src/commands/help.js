const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('RectBotの使い方とコマンド一覧を表示します')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('特定のコマンドの詳細を表示')
        .addChoices(
          { name: 'ping', value: 'ping' },
          { name: 'gamerecruit', value: 'gamerecruit' },
          { name: 'friendcode', value: 'friendcode' },
          { name: 'guildsettings', value: 'guildsettings' },
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
    .setDescription('RectBotの機能一覧です。詳細を知りたいコマンドを選んでください。')
    .addFields(
      {
        name: '🎮 ゲーム関連',
        value: '`/gamerecruit` - ゲーム募集を作成\n`/friendcode` - フレンドコード管理',
        inline: true
      },
      {
        name: '🛠️ ユーティリティ',
        value: '`/ping` - Bot応答確認\n`/help` - このヘルプを表示',
        inline: true
      },
      {
        name: '⚙️ 管理機能',
        value: '`/guildsettings` - ギルド募集設定',
        inline: true
      },
      {
        name: '📖 使い方',
        value: '下のメニューから詳細を確認したいコマンドを選んでください',
        inline: false
      }
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
        .setLabel('🎮 gamerecruit')
        .setDescription('ゲーム募集を作成する')
        .setValue('gamerecruit')
        .setEmoji('🎮'),
      new StringSelectMenuOptionBuilder()
        .setLabel('👥 friendcode')
        .setDescription('フレンドコードを管理する')
        .setValue('friendcode')
        .setEmoji('👥'),
      new StringSelectMenuOptionBuilder()
        .setLabel('⚙️ guildsettings')
        .setDescription('ギルドの募集設定を管理する')
        .setValue('guildsettings')
        .setEmoji('⚙️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🏓 ping')
        .setDescription('Botの応答を確認する')
        .setValue('ping')
        .setEmoji('🏓'),
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
    .setURL('https://rectbot.tech');

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const buttonRow = new ActionRowBuilder().addComponents(homeButton);

  // 応答方法を判定（reply or update）
  if (interaction.isButton()) {
    // ボタンからの操作の場合はupdate
    await interaction.update({
      embeds: [helpEmbed],
      components: [selectRow, buttonRow]
    });
  } else {
    // 最初のコマンド実行の場合はreply
    await interaction.reply({
      embeds: [helpEmbed],
      components: [selectRow, buttonRow],
      flags: MessageFlags.Ephemeral
    });
  }
}

// 特定のコマンドの詳細を表示
async function showCommandDetails(interaction, commandName) {
  const commandDetails = {
    ping: {
      title: '🏓 ping コマンド',
      description: 'Botの応答速度を確認するシンプルなコマンドです。',
      usage: '`/ping`',
      examples: '`/ping` → "Pong!" と応答',
      fields: [
        { name: '機能', value: 'Botが正常に動作しているかを確認', inline: false },
        { name: '用途', value: '• Bot接続確認\n• レスポンス速度測定', inline: false }
      ]
    },
    gamerecruit: {
      title: '🎮 gamerecruit コマンド',
      description: 'ゲーム募集を作成し、参加者を管理できる高機能なコマンドです。',
      usage: '`/gamerecruit`',
      examples: '`/gamerecruit` → モーダルが開き、募集内容を入力',
      fields: [
        { name: '📝 入力項目', value: '• **募集内容**: ゲームモードや内容\n• **参加人数**: 1-99人\n• **開始時間**: 例）21:00\n• **VC有無**: ボイスチャット参加の可否\n• **補足条件**: 自由記述', inline: false },
        { name: '🎯 機能', value: '• 美しい募集カード生成\n• 参加・取り消しボタン\n• リアルタイム参加者表示\n• 募集の締め切り機能', inline: false },
        { name: '🔄 操作方法', value: '✅ **参加**: 募集に参加\n❌ **取り消し**: 参加を取り消し\n🔒 **締め**: 募集を締め切り', inline: false }
      ]
    },
    friendcode: {
      title: '👥 friendcode コマンド',
      description: 'フレンドコードを保存・表示するコマンドです。（開発中）',
      usage: '`/friendcode`',
      examples: '`/friendcode` → フレンドコード管理画面（仮）',
      fields: [
        { name: '🚧 開発状況', value: '現在開発中のため、仮の応答のみ表示されます', inline: false },
        { name: '📋 予定機能', value: '• フレンドコード登録\n• フレンドコード表示\n• ゲーム別管理', inline: false }
      ]
    },
    guildsettings: {
      title: '⚙️ guildsettings コマンド',
      description: 'ギルド毎の募集設定を管理できるコマンドです。（サーバー管理権限が必要）',
      usage: '`/guildsettings`',
      examples: '`/guildsettings` → 設定画面を表示',
      fields: [
        { name: '🔧 設定項目', value: '• **募集チャンネル**: 募集を投稿するチャンネル\n• **通知ロール**: 募集時にメンションするロール\n• **既定タイトル**: 募集作成時の初期タイトル\n• **既定カラー**: 募集カードの色\n• **アップデート通知チャンネル**: Bot更新情報のチャンネル', inline: false },
        { name: '👤 権限', value: 'このコマンドは**サーバー管理**権限を持つユーザーのみ使用できます', inline: false },
        { name: '🎨 UI', value: 'Discord Components v2を使用した直感的な設定画面で簡単に設定変更できます', inline: false }
      ]
    },
    help: {
      title: '❓ help コマンド',
      description: 'RectBotの使い方とコマンド一覧を表示するコマンドです。',
      usage: '`/help [command]`',
      examples: '`/help` → 全体ヘルプ\n`/help ping` → pingコマンドの詳細',
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
    .setURL('https://rectbot.tech');

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