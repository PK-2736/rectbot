const {
  SlashCommandBuilder,
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder,
  AttachmentBuilder, SectionBuilder
} = require('discord.js');
// Components v2 で画像をインライン表示するためのビルダー
const { ThumbnailBuilder } = require('@discordjs/builders');
const path = require('path');
const fs = require('fs');


// 参加者リストを管理するためのメモリ上のMap（グローバル）
const recruitParticipants = new Map();
// 募集データを管理するためのMap
const recruitData = new Map();

// 募集状況API
const { saveRecruitStatus, deleteRecruitStatus } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamerecruit')
    .setDescription('ゲーム募集を作成します'),
  async execute(interaction) {
    try {
      // モーダル表示
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modal = new ModalBuilder()
        .setCustomId('recruitModal')
        .setTitle('🎮 募集内容入力');

      const contentInput = new TextInputBuilder()
        .setCustomId('content')
        .setLabel('募集内容（例: ガチエリア / 初心者歓迎 / 2時間）')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const participantsInput = new TextInputBuilder()
        .setCustomId('participants')
        .setLabel('参加人数（例: 4）')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2)
        .setPlaceholder('1-99の数字を入力してください');
      const timeInput = new TextInputBuilder()
        .setCustomId('startTime')
        .setLabel('開始時間（例: 21:00）')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const vcInput = new TextInputBuilder()
        .setCustomId('vc')
        .setLabel('VCの有無（あり / なし）')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const noteInput = new TextInputBuilder()
        .setCustomId('note')
        .setLabel('補足条件（自由記述）')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(contentInput),
        new ActionRowBuilder().addComponents(participantsInput),
        new ActionRowBuilder().addComponents(timeInput),
        new ActionRowBuilder().addComponents(vcInput),
        new ActionRowBuilder().addComponents(noteInput)
      );

      await interaction.showModal(modal);
    } catch (error) {
      console.error('Modal display error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'モーダル表示エラーが発生しました。', flags: MessageFlags.Ephemeral });
      }
    }
  },

  // モーダル送信後の処理（interactionCreateイベントで呼び出し）
  async handleModalSubmit(interaction) {
    if (interaction.customId !== 'recruitModal') return;
    try {
      // 人数の入力値を検証
      const participantsInput = interaction.fields.getTextInputValue('participants');
      const participantsNum = parseInt(participantsInput);
      
      if (isNaN(participantsNum) || participantsNum < 1 || participantsNum > 99) {
        await interaction.reply({
          content: '❌ 参加人数は1〜99の数字で入力してください。',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const recruitDataObj = {
        content: interaction.fields.getTextInputValue('content'),
        participants: participantsNum,
        startTime: interaction.fields.getTextInputValue('startTime'),
        vc: interaction.fields.getTextInputValue('vc'),
        note: interaction.fields.getTextInputValue('note'),
      };

      // 募集データを保存（メッセージIDとして使用するIDを統一）
      const messageKey = interaction.id;
      recruitData.set(messageKey, recruitDataObj);
      console.log('募集データを保存しました。ID:', messageKey);

      // Canvas画像生成（参加者リストとDiscordクライアントも渡す）
      const { generateRecruitCard } = require('../utils/canvasRecruit');
      const currentParticipants = recruitParticipants.get(messageKey) || [];
      const buffer = await generateRecruitCard(recruitDataObj, currentParticipants, interaction.client);
      const user = interaction.targetUser || interaction.user;

      // ボタン付きメッセージを投稿（バッファから直接送信）
      const image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
      recruitParticipants.set(messageKey, []);
      const participantText = "### 👥 参加リスト\n（まだ参加者はいません）";
      const container = new ContainerBuilder();
      container.setAccentColor(0xFF69B4);

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# 🎮️ **ゲーム募集** \n **${user.username}さんの募集**<@&1416797165769986161>`)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder({
                media: { url: user.displayAvatarURL() }
            })
          )
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://recruit-card.png')
          )
        )
      container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(participantText)
        )

      container.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("join")
              .setLabel("参加")
              .setEmoji('✅')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId("cancel")
              .setLabel("取り消し")
              .setEmoji('✖️')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("close")
              .setLabel("締め")
              .setStyle(ButtonStyle.Secondary)
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`募集ID：\`${interaction.id.slice(-8)}\` | powered by **rectbot**`)
        );
      
      await interaction.reply({
        files: [image],
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });

      // メッセージが投稿された後、実際のメッセージを取得してIDで募集データを再保存
      try {
        const replyMessage = await interaction.fetchReply();
        const actualMessageId = replyMessage.id;
        recruitData.set(actualMessageId, recruitDataObj);
        recruitParticipants.set(actualMessageId, []);
        console.log('実際のメッセージIDで募集データを再保存:', actualMessageId);
        // 元のinteraction IDのデータは削除
        recruitData.delete(messageKey);
        recruitParticipants.delete(messageKey);
        console.log('元のinteraction IDのデータを削除:', messageKey);

        // === 募集状況をAPI経由で保存 ===
        await saveRecruitStatus(
          interaction.guildId,
          interaction.channelId,
          actualMessageId,
          new Date().toISOString()
        );
      } catch (error) {
        console.error('メッセージ取得エラー:', error);
      }
    } catch (error) {
      console.error('handleModalSubmit error:', error);
      if (error && error.stack) console.error(error.stack);
      // 2重返信防止: replied/deferred両方判定
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `モーダル送信エラー: ${error.message || error}`, flags: MessageFlags.Ephemeral });
      } else {
        // 既に返信済みならeditReplyでエラー表示
        await interaction.editReply({ content: `モーダル送信エラー: ${error.message || error}` });
      }
    }
  },

  // （重複部分削除済み）

  // ボタンインタラクションの処理
  async handleButton(interaction) {
    // 実際のメッセージIDを使用
    const messageId = interaction.message.id;
    console.log('ボタンクリック - メッセージID:', messageId);
    console.log('保存されている募集データのキー:', Array.from(recruitData.keys()));
    
    let participants = recruitParticipants.get(messageId) || [];

    switch (interaction.customId) {
      case "join": {
        // すでに参加していなければ追加
        if (!participants.includes(interaction.user.id)) {
          participants.push(interaction.user.id);
          recruitParticipants.set(messageId, participants);
        }
        await updateParticipantList(interaction, participants);
        await interaction.reply({ content: "✅ 参加しました！", flags: MessageFlags.Ephemeral });
        break;
      }
      case "cancel": {
        // 参加者から削除
        participants = participants.filter(id => id !== interaction.user.id);
        recruitParticipants.set(messageId, participants);
        await updateParticipantList(interaction, participants);
        await interaction.reply({ content: "❌ 取り消しました。", flags: MessageFlags.Ephemeral });
        break;
      }
      case "close": {
        // === 募集状況をAPI経由で削除 ===
        await deleteRecruitStatus(interaction.guildId);
        await interaction.reply({ content: "🔒 締め切りました。", flags: MessageFlags.Ephemeral });
        break;
      }
    }
  }
};

// 参加リスト表示を更新する関数
async function updateParticipantList(interaction, participants) {
  // 実際のメッセージIDを使用
  const updateMessageId = interaction.message.id;
  console.log('updateParticipantList - 検索ID:', updateMessageId);
  const savedRecruitData = recruitData.get(updateMessageId);
  
  if (savedRecruitData) {
    console.log('募集データが見つかりました:', savedRecruitData);
    // 新しい画像を生成
    const { generateRecruitCard } = require('../utils/canvasRecruit');
    const newImageBuffer = await generateRecruitCard(savedRecruitData, participants, interaction.client);
    var newImage = new AttachmentBuilder(newImageBuffer, { name: 'recruit-card.png' });
  } else {
    console.log('保存された募集データが見つかりません:', updateMessageId);
    console.log('利用可能なキー:', Array.from(recruitData.keys()));
    // データが見つからない場合は更新をスキップ
    return;
  }

  // メンションリスト生成
  let participantText = "### 👥 参加リスト\n";
  if (participants.length === 0) {
    participantText += "> まだ参加者はいません";
  } else {
    participantText += participants.map(id => `<@${id}>`).join();
  }

  // メッセージのコンポーネントを再構築
  const oldContainer = interaction.message.components[0];
  const newContainer = new ContainerBuilder()
  const user = interaction.targetUser || interaction.user;
  newContainer.setAccentColor(0xFF69B4);
  newContainer.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# 🎮️ **ゲーム募集** \n**${user.username}さんの募集**<@&1416797165769986161>`)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder({
                media: { url: user.displayAvatarURL() }
            })
          )
      );

  newContainer.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

newContainer.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://recruit-card.png')
      )
    )
    // 参加リストの上に区切り線を追加
newContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(participantText)
      );

newContainer.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("join")
          .setLabel("参加")
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("cancel")
          .setLabel("取り消し")
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("close")
          .setLabel("締め")
          .setStyle(ButtonStyle.Secondary)
      )
    );

  // フッター情報を追加
  const footerMessageId = interaction.message.interaction?.id || interaction.message.id;
  newContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`募集ID：\`${footerMessageId.slice(-8)}\` | powered by **rectbot**`)
    );

  // メッセージ編集（新しい画像も含める）
  await interaction.message.edit({ 
    files: [newImage],
    components: [newContainer] 
  });
}
