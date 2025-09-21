const {
  SlashCommandBuilder,
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonGroupBuilder,
  MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder,
  AttachmentBuilder, SectionBuilder, EmbedBuilder
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
const { saveRecruitStatus, deleteRecruitStatus, saveRecruitmentData, deleteRecruitmentData, updateRecruitmentStatus } = require('../utils/db');

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

      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('タイトル（例: スプラトゥーン3 ガチマッチ募集）')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const contentInput = new TextInputBuilder()
        .setCustomId('content')
        .setLabel('募集内容（例: ガチエリア / 初心者歓迎 / 2時間）')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder('詳細な募集内容を入力してください...\n例:\n・ガチエリア中心\n・初心者歓迎\n・約2時間程度\n・楽しく遊びましょう！');
      const participantsInput = new TextInputBuilder()
        .setCustomId('participants')
        .setLabel('参加人数（例: 4）')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2)
        .setPlaceholder('1-16の数字を入力してください');
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

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(contentInput),
        new ActionRowBuilder().addComponents(participantsInput),
        new ActionRowBuilder().addComponents(timeInput),
        new ActionRowBuilder().addComponents(vcInput)
      );

      await interaction.showModal(modal);
    } catch (error) {
      console.error('Modal display error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: 'モーダル表示エラーが発生しました。', 
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
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
      
      if (isNaN(participantsNum) || participantsNum < 1 || participantsNum > 16) {
        await interaction.reply({
          content: '❌ 参加人数は1〜16の数字で入力してください。',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return;
      }

      const recruitDataObj = {
        title: interaction.fields.getTextInputValue('title'),
        content: interaction.fields.getTextInputValue('content'),
        participants: participantsNum,
        startTime: interaction.fields.getTextInputValue('startTime'),
        vc: interaction.fields.getTextInputValue('vc'),
        recruiterId: interaction.user.id // 募集主のIDを追加
      };

      // 募集データを保存（メッセージIDとして使用するIDを統一）
      const messageKey = interaction.id;
      recruitData.set(messageKey, recruitDataObj);
      // 募集主を初めから参加者として追加
      recruitParticipants.set(messageKey, [interaction.user.id]);
      console.log('募集データを保存しました。ID:', messageKey);
      console.log('募集主を初期参加者として追加:', interaction.user.id);

      // Canvas画像生成（参加者リストとDiscordクライアントも渡す）
      const { generateRecruitCard } = require('../utils/canvasRecruit');
      // 募集主を初期参加者として含める
      const currentParticipants = [interaction.user.id];
      const buffer = await generateRecruitCard(recruitDataObj, currentParticipants, interaction.client);
      const user = interaction.targetUser || interaction.user;

      // 募集パネル送信前に通知メッセージを送信
      console.log('ロールメンション送信中: 1416797165769986161');
      
      // 1. メンション通知
      await interaction.channel.send({
        content: '新しい募集が取付けられました。<@&1416797165769986161>',
        allowedMentions: { roles: ['1416797165769986161'] }
      });
      console.log('ロールメンション送信完了');

      // ボタン付きメッセージを投稿（バッファから直接送信）
      const image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
      // 初期の参加リスト表示を修正（募集主が参加済み）
      const participantText = `🎯✨ 参加リスト ✨🎯\n🎮 <@${interaction.user.id}>`;
      const container = new ContainerBuilder();
      container.setAccentColor(0xFF69B4);

      // ユーザー名表示（絵文字で豪華に装飾）
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`🎮✨ **${user.username}さんの募集** ✨🎮`)
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
          new TextDisplayBuilder().setContent(`募集ID：準備中... | powered by **rectbot**`)
        );
      
      // 2. Components v2 のパネル送信
      // 2. Components v2 のパネル送信
      const followUpMessage = await interaction.reply({
        files: [image],
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { roles: [], users: [] }
      });

      // interaction.reply()の場合、メッセージIDの取得方法が異なる
      // fetchReply()を使用して実際のメッセージを取得
      try {
        const actualMessage = await interaction.fetchReply();
        const actualMessageId = actualMessage.id;
        recruitData.set(actualMessageId, recruitDataObj);
        // 募集主を初期参加者として設定
        recruitParticipants.set(actualMessageId, [interaction.user.id]);
        console.log('実際のメッセージIDで募集データを保存:', actualMessageId);
        console.log('保存された募集データ:', recruitDataObj);
        console.log('現在のrecruitDataキー一覧:', Array.from(recruitData.keys()));
        console.log('募集主を初期参加者として設定:', interaction.user.id);

        // 正しい募集IDでメッセージを更新
        const correctRecruitId = actualMessageId.slice(-8);
        console.log('正しい募集IDで更新:', correctRecruitId);
        
        // 新しいコンテナを作成（正しい募集IDを含む）
        const updatedContainer = new ContainerBuilder();
        updatedContainer.setAccentColor(0xFF69B4);

        // ユーザー名表示
        updatedContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`🎮✨ **${user.username}さんの募集** ✨🎮`)
        );

        updatedContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 新しい画像を生成（正しいメッセージIDを使用）
        const { generateRecruitCard } = require('../utils/canvasRecruit');
        const updatedImageBuffer = await generateRecruitCard(recruitDataObj, [interaction.user.id], interaction.client);
        const updatedImage = new AttachmentBuilder(updatedImageBuffer, { name: 'recruit-card.png' });

        updatedContainer.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder()
              .setImage('attachment://recruit-card.png')
              .setAltText('募集カード')
          )
        );

        // ボタン
        updatedContainer.addButtonGroupComponents(
          new ButtonGroupBuilder()
            .addButtons(
              new ButtonBuilder()
                .setCustomId("join")
                .setLabel("参加")
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId("leave")
                .setLabel("退出")
                .setStyle(ButtonStyle.Secondary),
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
          new TextDisplayBuilder().setContent(`募集ID：\`${correctRecruitId}\` | powered by **rectbot**`)
        );

        // メッセージを更新
        try {
          await actualMessage.edit({
            files: [updatedImage],
            components: [updatedContainer],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { roles: [], users: [] }
          });
          console.log('募集IDを正しい値に更新しました:', correctRecruitId);
        } catch (editError) {
          console.error('メッセージ更新エラー:', editError);
        }

        // 8時間後の自動締切タイマーを設定
        setTimeout(async () => {
          try {
            // 募集がまだ存在するかチェック
            if (recruitData.has(actualMessageId)) {
              console.log('8時間経過による自動締切実行:', actualMessageId);
              await autoCloseRecruitment(interaction.client, interaction.guildId, interaction.channelId, actualMessageId);
            }
          } catch (error) {
            console.error('自動締切処理でエラー:', error);
          }
        }, 8 * 60 * 60 * 1000); // 8時間 = 28,800,000ms
        
        // 元のinteraction IDのデータがあれば削除
        if (recruitData.has(messageKey)) {
          recruitData.delete(messageKey);
          recruitParticipants.delete(messageKey);
          console.log('元のinteraction IDのデータを削除:', messageKey);
        }

        // === 募集状況をAPI経由で保存 ===
        await saveRecruitStatus(
          interaction.guildId,
          interaction.channelId,
          actualMessageId,
          new Date().toISOString()
        );

        // === 新しい募集データAPIに保存 ===
        try {
          const guild = interaction.guild;
          const channel = interaction.channel;
          await saveRecruitmentData(
            interaction.guildId,
            interaction.channelId,
            actualMessageId,
            guild ? guild.name : 'Unknown Guild',
            channel ? channel.name : 'Unknown Channel',
            recruitDataObj
          );
          console.log('募集データをAPIに保存しました');
        } catch (error) {
          console.error('募集データAPIへの保存に失敗:', error);
        }
      } catch (error) {
        console.error('メッセージ取得エラー:', error);
      }
    } catch (error) {
      console.error('handleModalSubmit error:', error);
      if (error && error.stack) console.error(error.stack);
      // 2重返信防止: replied/deferred両方判定
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: `モーダル送信エラー: ${error.message || error}`, 
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
      } else {
        // 既に返信済みならeditReplyでエラー表示
        await interaction.editReply({ content: `モーダル送信エラー: ${error.message || error}` });
      }
    }
  },  // （重複部分削除済み）

  // ボタンインタラクションの処理
  async handleButton(interaction) {
    // 実際のメッセージIDを使用
    const messageId = interaction.message.id;
    console.log('=== ボタンクリック処理開始 ===');
    console.log('ボタンクリック - メッセージID:', messageId);
    console.log('ボタンクリック - ボタンID:', interaction.customId);
    console.log('保存されている募集データのキー:', Array.from(recruitData.keys()));
    console.log('保存されている参加者データのキー:', Array.from(recruitParticipants.keys()));
    
    let participants = recruitParticipants.get(messageId) || [];
    console.log('現在の参加者リスト:', participants);

    switch (interaction.customId) {
      case "join": {
        // すでに参加していなければ追加
        if (!participants.includes(interaction.user.id)) {
          participants.push(interaction.user.id);
          recruitParticipants.set(messageId, participants);
          console.log('参加者追加:', interaction.user.id, '現在の参加者:', participants);
          
          // 募集データを取得して募集主に通知
          const savedRecruitData = recruitData.get(messageId);
          if (savedRecruitData && savedRecruitData.recruiterId) {
            const joinEmbed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle('🎮 新しい参加者がいます！')
              .setDescription(`<@${interaction.user.id}> が募集に参加しました！`)
              .addFields(
                { name: '募集タイトル', value: savedRecruitData.title, inline: false },
                { name: '現在の参加者数', value: `${participants.length}/${savedRecruitData.participants}人`, inline: true }
              )
              .setTimestamp();

            const notificationMessage = await interaction.reply({
              content: `<@${savedRecruitData.recruiterId}>`,
              embeds: [joinEmbed],
              allowedMentions: { users: [savedRecruitData.recruiterId] }
            });

            // 3分後に通知メッセージを削除
            setTimeout(async () => {
              try {
                await notificationMessage.delete();
              } catch (error) {
                console.log('通知メッセージの削除に失敗:', error.message);
              }
            }, 3 * 60 * 1000); // 3分 = 180,000ms
          } else {
            // フォールバック
            await interaction.reply({ 
              content: "✅ 参加しました！", 
              flags: MessageFlags.Ephemeral,
              allowedMentions: { roles: [], users: [] }
            });
          }
        } else {
          console.log('既に参加済み:', interaction.user.id);
          await interaction.reply({ 
            content: "❌ 既に参加済みです。", 
            flags: MessageFlags.Ephemeral,
            allowedMentions: { roles: [], users: [] }
          });
        }
        await updateParticipantList(interaction, participants);
        break;
      }
      case "cancel": {
        // 参加者から削除
        const beforeLength = participants.length;
        const savedRecruitData = recruitData.get(messageId);
        
        // 募集主の場合は特別な処理
        if (savedRecruitData && savedRecruitData.recruiterId === interaction.user.id) {
          await interaction.reply({ 
            content: "❌ 募集主は参加をキャンセルできません。募集を締め切る場合は「締め」ボタンを使用してください。", 
            flags: MessageFlags.Ephemeral,
            allowedMentions: { roles: [], users: [] }
          });
          return;
        }
        
        participants = participants.filter(id => id !== interaction.user.id);
        
        if (beforeLength > participants.length) {
          // 実際に削除された場合
          recruitParticipants.set(messageId, participants);
          console.log('参加者削除:', interaction.user.id, '削除前:', beforeLength, '削除後:', participants.length);
          
          // 募集データを取得して募集主に通知
          if (savedRecruitData && savedRecruitData.recruiterId) {
            const cancelEmbed = new EmbedBuilder()
              .setColor(0xFF6B35)
              .setTitle('📤 参加者がキャンセルしました')
              .setDescription(`<@${interaction.user.id}> が募集から離脱しました。`)
              .addFields(
                { name: '募集タイトル', value: savedRecruitData.title, inline: false },
                { name: '現在の参加者数', value: `${participants.length}/${savedRecruitData.participants}人`, inline: true }
              )
              .setTimestamp();

            const notificationMessage = await interaction.reply({
              content: `<@${savedRecruitData.recruiterId}>`,
              embeds: [cancelEmbed],
              allowedMentions: { users: [savedRecruitData.recruiterId] }
            });

            // 3分後に通知メッセージを削除
            setTimeout(async () => {
              try {
                await notificationMessage.delete();
              } catch (error) {
                console.log('通知メッセージの削除に失敗:', error.message);
              }
            }, 3 * 60 * 1000); // 3分 = 180,000ms
          } else {
            // フォールバック
            await interaction.reply({ 
              content: "❌ 取り消しました。", 
              flags: MessageFlags.Ephemeral,
              allowedMentions: { roles: [], users: [] }
            });
          }
        } else {
          // 元々参加していない場合
          await interaction.reply({ 
            content: "❌ 参加していないため、取り消せません。", 
            flags: MessageFlags.Ephemeral,
            allowedMentions: { roles: [], users: [] }
          });
        }
        await updateParticipantList(interaction, participants);
        break;
      }
      case "close": {
        const messageId = interaction.message.id;
        
        // === 募集状況をAPI経由で削除 ===
        await deleteRecruitStatus(interaction.guildId);
        
        // === 管理ページの募集データステータスを更新 ===
        try {
          await updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());
          console.log('管理ページの募集ステータスを更新しました:', messageId);
        } catch (error) {
          console.error('管理ページの募集ステータス更新に失敗:', error);
        }
        
        // ボタンを無効化
        const disabledContainer = new ContainerBuilder()
        const user = interaction.user;
        disabledContainer.setAccentColor(0x808080); // グレー色

        // 元のコンテンツを維持しつつボタンを無効化
        const originalMessage = interaction.message;
        
        // 既存のコンテンツを再構築（ボタンなし）
        disabledContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`🎮✨ **募集締め切り済み** ✨🎮`)
        );

        disabledContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 元の画像を維持
        disabledContainer.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(originalMessage.attachments.first()?.url || 'attachment://recruit-card.png')
          )
        )

        disabledContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("🔒 **この募集は締め切られました** 🔒")
        );

        const footerMessageId = interaction.message.interaction?.id || interaction.message.id;
        disabledContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`募集ID：\`${footerMessageId.slice(-8)}\` | powered by **rectbot**`)
        );

        // メッセージを更新（ボタンなし）
        await interaction.message.edit({
          components: [disabledContainer],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { roles: [], users: [] }
        });

        // 締め切りメッセージをembedで送信
        const savedRecruitData = recruitData.get(messageId);
        if (savedRecruitData && savedRecruitData.recruiterId) {
          const finalParticipants = recruitParticipants.get(messageId) || [];
          const closeEmbed = new EmbedBuilder()
            .setColor(0x808080)
            .setTitle('🔒 募集締切')
            .setDescription(`**${savedRecruitData.title}** の募集を締め切りました。`)
            .addFields(
              { name: '最終参加者数', value: `${finalParticipants.length}/${savedRecruitData.participants}人`, inline: false }
            );

          await interaction.reply({
            content: `<@${savedRecruitData.recruiterId}>`,
            embeds: [closeEmbed],
            allowedMentions: { users: [savedRecruitData.recruiterId] }
          });

          // メモリからデータを削除（自動締切タイマーもクリア）
          recruitData.delete(messageId);
          recruitParticipants.delete(messageId);
          console.log('手動締切完了、メモリからデータを削除:', messageId);
        } else {
          // フォールバック
          await interaction.reply({ 
            content: "🔒 募集を締め切りました。", 
            flags: MessageFlags.Ephemeral,
            allowedMentions: { roles: [], users: [] }
          });
        }
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
  console.log('updateParticipantList - 受け取った参加者:', participants);
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
  let participantText = "🎯✨ 参加リスト ✨🎯\n";
  if (participants.length === 0) {
    participantText += "✨（まだ参加者はいません）✨";
  } else {
    const mentions = participants.map(id => `<@${id}>`).join(" 🎮 ");
    participantText += "🎮 " + mentions;
    console.log('生成されたメンションテキスト:', participantText);
  }  // メッセージのコンポーネントを再構築
  const oldContainer = interaction.message.components[0];
  const newContainer = new ContainerBuilder()
  const user = interaction.targetUser || interaction.user;
  newContainer.setAccentColor(0xFF69B4);

  // ユーザー名表示（絵文字で豪華に装飾）
  newContainer.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`🎮✨ **${user.username}さんの募集** ✨🎮`)
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
  console.log('メッセージ編集開始 - 参加者リスト:', participants);
  await interaction.message.edit({ 
    files: [newImage],
    components: [newContainer],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: participants }
  });
  console.log('メッセージ編集完了');
}

// 自動締切処理関数
async function autoCloseRecruitment(client, guildId, channelId, messageId) {
  try {
    console.log('自動締切処理開始:', messageId);
    
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);
    
    const savedRecruitData = recruitData.get(messageId);
    if (!savedRecruitData) {
      console.log('募集データが見つからないため自動締切をスキップ:', messageId);
      return;
    }

    // === API経由で削除 ===
    await deleteRecruitStatus(guildId);
    
    // === 管理ページの募集データステータスを更新 ===
    try {
      await updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());
      console.log('管理ページの募集ステータスを更新しました(自動):', messageId);
    } catch (error) {
      console.error('管理ページの募集ステータス更新に失敗(自動):', error);
    }

    // ボタンを無効化したコンテナを作成
    const disabledContainer = new ContainerBuilder();
    disabledContainer.setAccentColor(0x808080); // グレー色

    disabledContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🎮✨ **募集締め切り済み（自動）** ✨🎮`)
    );

    disabledContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // 元の画像を維持
    disabledContainer.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(message.attachments.first()?.url || 'attachment://recruit-card.png')
      )
    )

    disabledContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("🔒 **この募集は自動で締め切られました（8時間経過）** 🔒")
    );

    const footerMessageId = messageId;
    disabledContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`募集ID：\`${footerMessageId.slice(-8)}\` | powered by **rectbot**`)
    );

    // メッセージを更新（ボタンなし）
    await message.edit({
      components: [disabledContainer],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { roles: [], users: [] }
    });

    // 自動締切通知を送信
    const finalParticipants = recruitParticipants.get(messageId) || [];
    const autoCloseEmbed = new EmbedBuilder()
      .setColor(0xFF4444)
      .setTitle('⏰ 自動締切')
      .setDescription(`**${savedRecruitData.title}** の募集を自動で締め切りました。`)
      .addFields(
        { name: '最終参加者数', value: `${finalParticipants.length}/${savedRecruitData.participants}人`, inline: false }
      );

    await channel.send({
      content: `<@${savedRecruitData.recruiterId}>`,
      embeds: [autoCloseEmbed],
      allowedMentions: { users: [savedRecruitData.recruiterId] }
    });

    // メモリからデータを削除
    recruitData.delete(messageId);
    recruitParticipants.delete(messageId);
    console.log('自動締切完了:', messageId);

  } catch (error) {
    console.error('自動締切処理でエラーが発生:', error);
  }
}

// 募集データ操作用のメソッドを追加
module.exports.getRecruitData = function(messageId) {
  return recruitData.get(messageId);
};

module.exports.updateRecruitData = function(messageId, newData) {
  recruitData.set(messageId, newData);
};

module.exports.getParticipants = function(messageId) {
  return recruitParticipants.get(messageId);
};

// デバッグ用: すべての募集データを取得
module.exports.getAllRecruitData = function() {
  const allData = {};
  for (const [messageId, data] of recruitData.entries()) {
    allData[messageId] = {
      ...data,
      recruitId: messageId.slice(-8),
      participants: recruitParticipants.get(messageId) || []
    };
  }
  return allData;
};
