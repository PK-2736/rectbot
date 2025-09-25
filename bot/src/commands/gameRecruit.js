const {
  SlashCommandBuilder,
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder,
  AttachmentBuilder, SectionBuilder, EmbedBuilder
} = require('discord.js');
// Components v2 で画像をインライン表示するためのビルダー
const { ThumbnailBuilder } = require('@discordjs/builders');
const path = require('path');
const fs = require('fs');


// 参加者リストはメモリ上で管理（必要ならKV化も可）
// const recruitParticipants = new Map(); // 使われていないので削除

// Redis専用 募集データAPI
const { saveRecruitToRedis, getRecruitFromRedis, listRecruitsFromRedis, deleteRecruitFromRedis, pushRecruitToWebAPI, getGuildSettings } = require('../utils/db');

module.exports = {
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
    .addStringOption(option =>
      option.setName('color')
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
    ),
  async execute(interaction) {
    // --- 募集数制限: 特定ギルド以外は1件まで（KVで判定） ---
    const EXEMPT_GUILD_ID = '1414530004657766422';
    if (interaction.guildId !== EXEMPT_GUILD_ID) {
      const allRecruits = await listRecruitsFromRedis();
      const guildActiveCount = allRecruits.filter(r => r.guildId === interaction.guildId && r.status === 'recruiting').length;
      if (guildActiveCount >= 1) {
        await interaction.reply({
          content: '❌ このサーバーでは同時に実行できる募集は1件までです。既存の募集を締め切ってから新しい募集を作成してください。',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return;
      }
    }
    try {
      // ギルド設定を取得
      const guildSettings = await getGuildSettings(interaction.guildId);

      // 募集チャンネルが設定されている場合、そのチャンネルでのみ実行可能
      if (guildSettings.recruit_channel && guildSettings.recruit_channel !== interaction.channelId) {
        return await interaction.reply({
          content: `❌ 募集はこのチャンネルでは実行できません。\n📍 募集専用チャンネル: <#${guildSettings.recruit_channel}>`,
          flags: MessageFlags.Ephemeral
        });
      }

      // スラッシュコマンドの色オプション取得
      let selectedColor = interaction.options.getString('color');
      // セッティングカラーが未設定でも、セレクト値またはデフォルト色（ピンク）でモーダルを開ける
      if (!selectedColor) {
        // 設定色がなければデフォルト色（例: FF69B4）を仮でセット（実際の優先順位はhandleModalSubmitで再判定）
        selectedColor = undefined;
      }

      // 色選択値をinteractionに一時保存（未指定ならundefinedのまま）
      interaction.recruitPanelColor = selectedColor;

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
      if (guildSettings.defaultTitle) {
        titleInput.setValue(guildSettings.defaultTitle);
      }
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
    // --- 募集数制限: 特定ギルド以外は1件まで（KVで判定） ---
    const EXEMPT_GUILD_ID = '1414530004657766422';
    const { getActiveRecruits, saveRecruitmentData } = require('../utils/db');
    if (interaction.guildId !== EXEMPT_GUILD_ID) {
      const activeRecruits = await getActiveRecruits() || [];
      const recruitsArray = Array.isArray(activeRecruits) ? activeRecruits : [];
      const guildActiveCount = recruitsArray.filter(r => r.guild_id === interaction.guildId && r.status === 'recruiting').length;
      if (guildActiveCount >= 1) {
        await interaction.reply({
          content: '❌ このサーバーでは同時に実行できる募集は1件までです。既存の募集を締め切ってから新しい募集を作成してください。',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return;
      }
    }
    if (interaction.customId !== 'recruitModal') return;
    try {
      // ギルド設定を取得
      const guildSettings = await getGuildSettings(interaction.guildId);
      
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

      // 色の決定: セレクト（コマンドオプション）＞設定＞デフォルト
      let panelColor = null;
      // 1. コマンドオプション（executeで一時保存）
      if (typeof interaction.recruitPanelColor === 'string' && interaction.recruitPanelColor.length > 0) {
        panelColor = interaction.recruitPanelColor;
      } else if (guildSettings.defaultColor) {
        panelColor = guildSettings.defaultColor;
      } else {
        panelColor = undefined; // デフォルト色（色無し）
      }

      // 仮recruitIdは空文字で初期化し、メッセージ送信後に正しいrecruitIdをセット
      const recruitDataObj = {
        title: interaction.fields.getTextInputValue('title'),
        content: interaction.fields.getTextInputValue('content'),
        participants: participantsNum,
        startTime: interaction.fields.getTextInputValue('startTime'),
        vc: interaction.fields.getTextInputValue('vc'),
        recruiterId: interaction.user.id, // 募集主のDiscordユーザーIDを保存
        recruitId: '', // ここでは空、後で正しいIDをセット
        panelColor: panelColor
      };

  // KVにはメッセージ送信後に保存する（下で実施）

      // Canvas画像生成（参加者リストとDiscordクライアントも渡す）
      const { generateRecruitCard } = require('../utils/canvasRecruit');
      // 募集主を初期参加者として含める
      const currentParticipants = [interaction.user.id];
      // 色指定: セレクト＞設定＞デフォルト（なければ'000000'=黒）
      let useColor = panelColor ? panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000');
      // 先頭に#があれば除去
      if (typeof useColor === 'string' && useColor.startsWith('#')) {
        useColor = useColor.slice(1);
      }
      // 6桁の16進数文字列でなければデフォルト色に
      if (typeof useColor !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(useColor)) {
        useColor = '000000';
      }
      const buffer = await generateRecruitCard(recruitDataObj, currentParticipants, interaction.client, useColor);
      const user = interaction.targetUser || interaction.user;

      // 募集パネル送信前に通知メッセージを送信
      console.log('通知ロールでの通知送信中');
      
      // 1. メンション通知（ギルド設定があれば使用）
      if (guildSettings.notification_role) {
        await interaction.channel.send({
          content: `新しい募集が作成されました。<@&${guildSettings.notification_role}>`,
          allowedMentions: { roles: [guildSettings.notification_role] }
        });
        console.log('ギルド設定の通知ロールで送信完了:', guildSettings.notification_role);
      } else {
        // デフォルトの通知（従来の処理）
        await interaction.channel.send({
          content: '新しい募集が作成されました。<@&1416797165769986161>',
          allowedMentions: { roles: ['1416797165769986161'] }
        });
        console.log('デフォルト通知ロールで送信完了');
      }

  // 2回目以降のtempRecruitId宣言を削除
      
      // ボタン付きメッセージを投稿（バッファから直接送信）
      const image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
      const participantText = `🎯✨ 参加リスト ✨🎯\n🎮 <@${interaction.user.id}>`;
      const container = new ContainerBuilder();
      let accentColor = null;
      let panelColorForAccent = panelColor;
      if (typeof panelColorForAccent === 'string' && panelColorForAccent.startsWith('#')) {
        panelColorForAccent = panelColorForAccent.slice(1);
      }
      if (panelColorForAccent && /^[0-9A-Fa-f]{6}$/.test(panelColorForAccent)) {
        accentColor = parseInt(panelColorForAccent, 16);
      } else if (guildSettings.defaultColor && /^[0-9A-Fa-f]{6}$/.test(guildSettings.defaultColor)) {
        accentColor = parseInt(guildSettings.defaultColor, 16);
      } else {
        accentColor = 0x000000;
      }
      container.setAccentColor(accentColor);
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
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(participantText)
      );
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
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
      // 仮ID表示も後で上書きされるので空欄または仮表示
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`募集ID：\`(送信後決定)\` | powered by **rectbot**`)
      );
      const followUpMessage = await interaction.reply({
        files: [image],
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { roles: [], users: [] }
      });

      // ギルド設定で募集チャンネルが設定されている場合、そちらにも送信
      if (guildSettings.recruit_channel && guildSettings.recruit_channel !== interaction.channelId) {
        try {
          const recruitChannel = await interaction.guild.channels.fetch(guildSettings.recruit_channel);
          if (recruitChannel && recruitChannel.isTextBased()) {
            // 通知ロールの準備
            let mentionContent = '';
            if (guildSettings.notification_role) {
              mentionContent = `<@&${guildSettings.notification_role}> `;
            }
            
            await recruitChannel.send({
              content: mentionContent,
              files: [image],
              components: [container],
              flags: MessageFlags.IsComponentsV2,
              allowedMentions: { roles: guildSettings.notification_role ? [guildSettings.notification_role] : [], users: [] }
            });
            
            console.log('募集メッセージを指定チャンネルに送信しました:', guildSettings.recruit_channel);
          }
        } catch (channelError) {
          console.error('指定チャンネルへの送信でエラー:', channelError);
        }
      }

      // メッセージ送信後、実際のメッセージIDでrecruitIdを上書きし、保存・表示も必ず一致させる
      try {
        const actualMessage = await interaction.fetchReply();
        const actualMessageId = actualMessage.id;
        const actualRecruitId = actualMessageId.slice(-8);
        // recruitIdを正しい値で上書き
        recruitDataObj.recruitId = actualRecruitId;
        const finalRecruitData = {
          ...recruitDataObj,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          message_id: actualMessageId, // messageId → message_id に統一
          status: 'recruiting',
          start_time: new Date().toISOString(),
        };
        // Redisに保存 & Worker APIにpush
        try {
          await saveRecruitToRedis(actualRecruitId, finalRecruitData);
          console.log('Redisに募集データを保存: 成功', actualRecruitId);
          await pushRecruitToWebAPI(finalRecruitData);
          console.log('Worker APIに募集データをpush: 成功');
        } catch (err) {
          console.error('Redis保存またはAPI pushエラー:', err);
        }
        recruitParticipants.set(actualMessageId, [interaction.user.id]);
        console.log('Redisに保存しようとしたデータ:', finalRecruitData);
        // 新しい画像を生成（正しいメッセージIDを使用）
        const { generateRecruitCard } = require('../utils/canvasRecruit');
        const updatedImageBuffer = await generateRecruitCard(finalRecruitData, [interaction.user.id], interaction.client, guildSettings.defaultColor);
        const updatedImage = new AttachmentBuilder(updatedImageBuffer, { name: 'recruit-card.png' });
        const updatedContainer = new ContainerBuilder();
        updatedContainer.setAccentColor(accentColor);
        updatedContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`🎮✨ **${user.username}さんの募集** ✨🎮`)
        );
        updatedContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        updatedContainer.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://recruit-card.png')
          )
        );
        updatedContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        updatedContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(participantText)
        );
        updatedContainer.addActionRowComponents(
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
        updatedContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        updatedContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`募集ID：\`${actualRecruitId}\` | powered by **rectbot**`)
        );
        // メッセージを更新
        try {
          await actualMessage.edit({
            files: [updatedImage],
            components: [updatedContainer],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { roles: [], users: [] }
          });
          console.log('募集IDを正しい値に更新しました:', actualRecruitId);
        } catch (editError) {
          console.error('メッセージ更新エラー:', editError);
        }
        // 8時間後の自動締切タイマーを設定
        setTimeout(async () => {
          try {
            if (recruitData.has(actualMessageId)) {
              console.log('8時間経過による自動締切実行:', actualMessageId);
              await autoCloseRecruitment(interaction.client, interaction.guildId, interaction.channelId, actualMessageId);
            }
          } catch (error) {
            console.error('自動締切処理でエラー:', error);
          }
        }, 8 * 60 * 60 * 1000);
        setTimeout(async () => {
          try {
            if (recruitData.has(actualMessageId)) {
              console.log('8時間経過による自動締切実行:', actualMessageId);
              await autoCloseRecruitment(interaction.client, interaction.guildId, interaction.channelId, actualMessageId);
            }
          } catch (error) {
            console.error('自動締切処理でエラー:', error);
          }
        }, 8 * 60 * 60 * 1000);
        // === 募集状況をAPI経由で保存 ===
        // Redis専用のためAPI保存は省略
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
  // KV化のためrecruitDataは参照しない
  console.log('保存されている参加者データのキー:', Array.from(recruitParticipants.keys()));
    
  let participants = recruitParticipants.get(messageId) || [];
  console.log('現在の参加者リスト:', participants);
  const { getActiveRecruits, getGuildSettings } = require('../utils/db');
  // 最新の募集データをKVから取得
  let savedRecruitData = null;
  const allRecruits = await getActiveRecruits();
  savedRecruitData = allRecruits.find(r => r.message_id === messageId);

  switch (interaction.customId) {
      case "join": {
        // すでに参加していなければ追加
        if (!participants.includes(interaction.user.id)) {
          participants.push(interaction.user.id);
          recruitParticipants.set(messageId, participants);
          console.log('参加者追加:', interaction.user.id, '現在の参加者:', participants);
          // 募集データを取得して募集主に通知
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
  await updateParticipantList(interaction, participants, savedRecruitData);
        break;
      }
      case "cancel": {
        // 参加者から削除
  const beforeLength = participants.length;
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
  await updateParticipantList(interaction, participants, savedRecruitData);
        break;
      }
      case "close": {
        {
          const messageId = interaction.message.id;
          // === 募集状況をAPI経由で削除 ===
          const { deleteRecruitmentData } = require('../utils/db');
          await deleteRecruitmentData(messageId);
          // === 管理ページの募集データステータスを更新 ===
          try {
            await updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());
            console.log('管理ページの募集ステータスを更新しました:', messageId);
          } catch (error) {
            console.error('管理ページの募集ステータス更新に失敗:', error);
          }
          // ボタンを無効化
          const disabledContainer = new ContainerBuilder();
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
          );
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
        }
        break;
    }
  }
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
