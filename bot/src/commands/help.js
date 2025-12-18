const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { safeReply, safeUpdate } = require('../utils/safeReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
  .setDescription('Recruboの使い方とコマンド一覧を表示します')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('特定のコマンドの詳細を表示')
        .addChoices(
          { name: 'rect', value: 'rect' },
          { name: 'rect-edit', value: 'rect-edit' },
          { name: 'rect-close', value: 'rect-close' },
          { name: 'link-add', value: 'link-add' },
          { name: 'link-show', value: 'link-show' },
          { name: 'link-delete', value: 'link-delete' },
          { name: 'setting', value: 'setting' },
          { name: 'help', value: 'help' },
          { name: 'invite', value: 'invite' }
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
    .setColor(0xF97316)
    .setTitle('🤖 Recrubo ヘルプ')
    .setDescription('Recruboの機能一覧です。下のメニューからコマンドを選択すると詳細が表示されます。')
    .addFields(
      { name: '🎮 募集管理', value: '`/rect` - ゲーム募集を作成\n`/rect-edit` - 募集を編集\n`/rect-close` - 募集を締切', inline: false },
      { name: '🔗 フレンドコード', value: '`/link-add` - フレンドコードを登録\n`/link-show` - フレンドコードを表示\n`/link-delete` - フレンドコードを削除', inline: false },
      { name: '⚙️ その他', value: '`/setting` - ギルドの募集設定（管理者のみ）\n`/invite` - 公式サーバーとボット招待リンク\n`/help` - このヘルプを表示', inline: false }
    )
    .setFooter({ 
  text: 'Recrubo v1.0 | 作成者: Recrubo Team',
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
        .setLabel('✏️ rect-edit')
        .setDescription('既存の募集を編集する')
        .setValue('rect-edit')
        .setEmoji('✏️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🔒 rect-close')
        .setDescription('既存の募集を締め切る')
        .setValue('rect-close')
        .setEmoji('🔒'),
      new StringSelectMenuOptionBuilder()
        .setLabel('➕ link-add')
        .setDescription('フレンドコードを登録する')
        .setValue('link-add')
        .setEmoji('➕'),
      new StringSelectMenuOptionBuilder()
        .setLabel('👁️ link-show')
        .setDescription('フレンドコードを表示する')
        .setValue('link-show')
        .setEmoji('👁️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🗑️ link-delete')
        .setDescription('フレンドコードを削除する')
        .setValue('link-delete')
        .setEmoji('🗑️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('⚙️ setting')
        .setDescription('ギルドの募集設定を管理する（管理者）')
        .setValue('setting')
        .setEmoji('⚙️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('❓ help')
        .setDescription('このヘルプを表示する')
        .setValue('help')
        .setEmoji('❓'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🔗 invite')
        .setDescription('公式サーバーとボット招待リンクを表示')
        .setValue('invite')
        .setEmoji('🔗')
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
      description: 'Recruboの使い方とコマンド一覧を表示するコマンドです。',
      usage: '`/help [command]`',
      examples: '`/help` → 全体ヘルプ\n`/help rect` → rectコマンドの詳細',
      fields: [
        { name: '📖 オプション', value: '• **command**: 特定のコマンドの詳細を表示（省略可）', inline: false },
        { name: '💡 使い方', value: '• `/help` で全体のヘルプ表示\n• `/help [コマンド名]` で個別詳細表示\n• セレクトメニューからも選択可能', inline: false }
      ]
    }
    ,
    invite: {
      title: '🔗 invite コマンド',
      description: '公式サーバーへの参加リンクと、ボットのワンタイム招待リンクを発行して表示します。',
      usage: '`/invite`',
      examples: '`/invite` → 招待リンクを表示（ワンタイム生成）',
      fields: [
        { name: '🔒 ワンタイム招待', value: 'ワンタイムで発行されるボット招待リンクです。一度のみ有効になります。', inline: false }
      ]
    },
    'rect-edit': {
      title: '✏️ rect-edit コマンド',
      description: '既存の募集内容を編集できるコマンドです。',
      usage: '`/rect-edit id:[募集ID]`',
      examples: '`/rect-edit id:abc123` → 募集IDを指定して編集\nIDはオートコンプリートで選択可能',
      fields: [
        { name: '📝 編集可能項目', value: '• タイトル\n• 募集内容\n• 参加人数\n• 開始時間\n• VC有無\n• 色', inline: false },
        { name: '👤 権限', value: '募集を作成した本人のみ編集可能です', inline: false }
      ]
    },
    'rect-close': {
      title: '🔒 rect-close コマンド',
      description: '既存の募集を締め切るコマンドです。',
      usage: '`/rect-close 募集:[選択]`',
      examples: '`/rect-close` → 参加中の募集から選択して締切',
      fields: [
        { name: '🎯 機能', value: '• 参加中の募集をオートコンプリートで選択\n• 募集メッセージを締切状態に更新\n• 参加者への通知', inline: false },
        { name: '👤 権限', value: '募集を作成した本人のみ締切可能です', inline: false }
      ]
    },
    'link-add': {
      title: '➕ link-add コマンド',
      description: 'ゲームのフレンドコードやゲーマータグを登録するコマンドです。',
      usage: '`/link-add`',
      examples: '`/link-add` → モーダルでゲーム名とコードを入力',
      fields: [
        { name: '📝 登録方法', value: '1. コマンド実行でモーダルが開きます\n2. ゲーム名を入力（AIが自動認識）\n3. フレンドコード/IDを入力\n4. 登録完了', inline: false },
        { name: '🤖 AI認識', value: 'ゲーム名は略称でもOK（例: ばろ→Valorant）', inline: false }
      ]
    },
    'link-show': {
      title: '👁️ link-show コマンド',
      description: '登録済みのフレンドコードを表示するコマンドです。',
      usage: '`/link-show [user]`',
      examples: '`/link-show` → 自分のフレンドコード一覧\n`/link-show user:@ユーザー` → 指定ユーザーのコード',
      fields: [
        { name: '📋 表示内容', value: '• 登録済みゲーム一覧\n• 各ゲームのフレンドコード\n• 登録日時', inline: false },
        { name: '💡 便利機能', value: 'メンションでフレンドコードを呼び出すこともできます\n例: `valorant @自分`', inline: false }
      ]
    },
    'link-delete': {
      title: '🗑️ link-delete コマンド',
      description: '登録済みのフレンドコードを削除するコマンドです。',
      usage: '`/link-delete game:[ゲーム名]`',
      examples: '`/link-delete` → セレクトメニューから選択して削除',
      fields: [
        { name: '🎯 削除方法', value: '1. コマンド実行\n2. 登録済みゲームから選択\n3. 確認して削除', inline: false },
        { name: '⚠️ 注意', value: '削除したコードは復元できません', inline: false }
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
    .setColor(0xF97316)
    .setTitle(command.title)
    .setDescription(command.description)
    .addFields(
      { name: '📝 使用方法', value: command.usage, inline: true },
      { name: '💡 例', value: command.examples, inline: true },
      { name: '\u200B', value: '\u200B', inline: false }, // 空行
      ...command.fields
    )
    .setFooter({ 
      text: 'Recrubo ヘルプ | /help で戻る',
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