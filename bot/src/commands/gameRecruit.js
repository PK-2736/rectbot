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

// 参加者リストはメモリ上で管理
const recruitParticipants = new Map();

// 一時的にモーダルへ渡したいオプションを保存する（ユーザーIDをキーに）
const pendingModalOptions = new Map();

// 外部ハイドレーション用（index.js から呼び出すためのユーティリティ）
async function __hydrateParticipants(messageId, participants) {
  try {
    if (!messageId || !Array.isArray(participants)) return;
    recruitParticipants.set(messageId, participants);
    console.log('[hydrate] set participants for', messageId, participants.length);
  } catch (e) {
    console.warn('[hydrate] failed to set participants:', e?.message || e);
  }
}

// 安全な返信ヘルパー: reply -> followUp -> editReply の順でフォールバックし、Unknown interaction(10062) を吸収する
async function safeReply(interaction, options) {
  if (!interaction) return null;
  try {
    // 優先: まだ返信していない/deferred していない場合は reply
    if (!interaction.replied && !interaction.deferred) {
      return await interaction.reply(options);
    }
    // 既に応答済みまたは defer 済みの場合は followUp を試す
    try {
      return await interaction.followUp(options);
    } catch (followErr) {
      // followUp も失敗したら editReply を試す
      try {
        return await interaction.editReply(options);
      } catch (editErr) {
        console.warn('safeReply: all response methods failed:', editErr?.message || editErr);
        return null;
      }
    }
  } catch (err) {
    // Discord の Unknown interaction 等は吸収して処理継続
    if (err && err.code === 10062) {
      console.warn('safeReply: Unknown interaction (ignored)');
      return null;
    }
    console.warn('safeReply unexpected error:', err?.message || err);
    // 最後の努力で followUp/editReply を試す
    try { return await interaction.followUp(options); } catch (e) { try { return await interaction.editReply(options); } catch (e2) { return null; } }
  }
}

// Redis専用 募集データAPI
const { saveRecruitToRedis, getRecruitFromRedis, listRecruitsFromRedis, deleteRecruitFromRedis, pushRecruitToWebAPI, getGuildSettings, saveParticipantsToRedis, getParticipantsFromRedis, deleteParticipantsFromRedis } = require('../utils/db');
const { buildContainer, sendChannelNotification } = require('../utils/recruitHelpers');

// ヘルパー: 参加者リストをメッセージに反映してRedisに保存する
async function updateParticipantList(interactionOrMessage, participants, savedRecruitData) {
  try {
    // interactionOrMessage は interaction オブジェクトか message オブジェクトのどちらか
    let interaction = null;
    let message = null;
    if (interactionOrMessage && interactionOrMessage.message) {
      interaction = interactionOrMessage;
      message = interaction.message;
    } else {
      message = interactionOrMessage;
    }
    const client = (interaction && interaction.client) || (message && message.client);
    const db = require('../utils/db');

    // savedRecruitData がない場合は Redis から復元を試みる
    if (!savedRecruitData) {
      try {
        const recruitId = message?.id ? String(message.id).slice(-8) : null;
        if (recruitId) {
          const fromRedis = await db.getRecruitFromRedis(recruitId);
          if (fromRedis) savedRecruitData = fromRedis;
        }
      } catch (e) {
        console.warn('updateParticipantList: getRecruitFromRedis failed:', e?.message || e);
      }
    }
    const guildId = savedRecruitData?.guildId || (interaction && interaction.guildId) || (message && message.guildId);

    // ギルド設定を取得して色を決定
    const guildSettings = await getGuildSettings(guildId);
    let useColor = savedRecruitData?.panelColor || guildSettings?.defaultColor || '000000';
    if (typeof useColor === 'string' && useColor.startsWith('#')) useColor = useColor.slice(1);
    if (!/^[0-9A-Fa-f]{6}$/.test(useColor)) useColor = '000000';

    // 画像を再生成
    const { generateRecruitCard } = require('../utils/canvasRecruit');
    const buffer = await generateRecruitCard(savedRecruitData, participants, client, useColor);
    const updatedImage = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });

    // コンテナを再構築（共通ヘルパーを利用し、募集主以外は締めボタンを disabled にする）
    const participantText = `🎯✨ 参加リスト ✨🎯\n${participants.map(id => `<@${id}>`).join(' ')}`;
    let headerTitle = savedRecruitData?.title || '募集';
    try {
      if (savedRecruitData && savedRecruitData.recruiterId && client) {
        const user = await client.users.fetch(savedRecruitData.recruiterId).catch(() => null);
        if (user && (user.username || user.displayName || user.tag)) {
          const name = user.username || user.displayName || user.tag;
          headerTitle = `${name}さんの募集`;
        }
      }
    } catch (e) {
      console.warn('updateParticipantList: failed to fetch recruiter user:', e?.message || e);
    }
    const accentColor = parseInt(useColor, 16);
    const recruiterId = savedRecruitData?.recruiterId || null;
    // requesterId は interactionOrMessage が interaction の場合は interaction.user.id、message の場合は null
    const requesterId = interaction ? interaction.user?.id : null;
    const updatedContainer = buildContainer({ headerTitle, participantText, recruitIdText: savedRecruitData?.recruitId || (savedRecruitData?.message_id ? savedRecruitData.message_id.slice(-8) : '(unknown)'), accentColor, imageAttachmentName: 'attachment://recruit-card.png', recruiterId, requesterId });

    // メッセージを更新
    if (message && message.edit) {
      await message.edit({ files: [updatedImage], components: [updatedContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } });
    }

    // Redisへ永続化
    if (message && message.id) {
      await saveParticipantsToRedis(message.id, participants);
    }
  } catch (err) {
    console.error('updateParticipantList error:', err);
  }
}

module.exports = {
  // export in-memory map and hydration helper so index.js can hydrate on startup
  recruitParticipants,
  __hydrateParticipants,
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
        await safeReply(interaction, {
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
          return await safeReply(interaction, {
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

      // 色選択値を一時保存（モーダル送信では異なる interaction オブジェクトになるため Map を利用）
      interaction.recruitPanelColor = selectedColor; // 互換性のために残す
      try {
        if (interaction.user && interaction.user.id) {
          pendingModalOptions.set(interaction.user.id, { panelColor: selectedColor });
        }
      } catch (e) {
        console.warn('pendingModalOptions set failed:', e?.message || e);
      }

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
      // --- 募集数制限: 特定ギルド以外は1件まで（Redisで判定） ---
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // 3秒ルールを厳守
    console.log('[handleModalSubmit] started for guild:', interaction.guildId, 'user:', interaction.user?.id);
      const EXEMPT_GUILD_ID = '1414530004657766422';
      const { listRecruitsFromRedis, saveRecruitmentData } = require('../utils/db');
      if (interaction.guildId !== EXEMPT_GUILD_ID) {
        let allRecruits = [];
        try {
          allRecruits = await listRecruitsFromRedis();
        } catch (e) {
          console.warn('listRecruitsFromRedis failed:', e?.message || e);
          allRecruits = [];
        }
        const guildActiveCount = Array.isArray(allRecruits)
          ? allRecruits.filter(r => {
              const gid = r?.guildId || r?.guild_id || r?.guild || null;
              return gid === interaction.guildId && (r.status === 'recruiting' || r.status === 'active');
            }).length
          : 0;
        console.log('[handleModalSubmit] guildActiveCount for', interaction.guildId, '=', guildActiveCount);
        if (guildActiveCount >= 1) {
          await safeReply(interaction, {
            content: '❌ このサーバーでは同時に実行できる募集は1件までです。既存の募集を締め切ってから新しい募集を作成してください。',
            flags: MessageFlags.Ephemeral,
            allowedMentions: { roles: [], users: [] }
          });
          return;
        }
      }
    if (interaction.customId !== 'recruitModal') {
      console.log('[handleModalSubmit] ignored customId:', interaction.customId);
      return;
    }
    console.log('[handleModalSubmit] proceeding with recruitModal for', interaction.user?.id);
    try {
      // ギルド設定を取得
      const guildSettings = await getGuildSettings(interaction.guildId);
      
      // 人数の入力値を検証
      const participantsInput = interaction.fields.getTextInputValue('participants');
      const participantsNum = parseInt(participantsInput);
      if (isNaN(participantsNum) || participantsNum < 1 || participantsNum > 16) {
        await safeReply(interaction, {
          content: '❌ 参加人数は1〜16の数字で入力してください。',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return;
      }

      // 色の決定: セレクト（コマンドオプション）＞設定＞デフォルト
      let panelColor = null;
      // 1. コマンドオプション（executeで一時保存）-> pendingModalOptions 経由で受け取る
      try {
        const pending = interaction.user && interaction.user.id ? pendingModalOptions.get(interaction.user.id) : null;
        if (pending && typeof pending.panelColor === 'string' && pending.panelColor.length > 0) {
          panelColor = pending.panelColor;
          // 一度取得したら破棄
          pendingModalOptions.delete(interaction.user.id);
        } else if (typeof interaction.recruitPanelColor === 'string' && interaction.recruitPanelColor.length > 0) {
          // 互換性フォールバック
          panelColor = interaction.recruitPanelColor;
        } else if (guildSettings.defaultColor) {
          panelColor = guildSettings.defaultColor;
        } else {
          panelColor = undefined; // デフォルト色（色無し）
        }
      } catch (e) {
        console.warn('handleModalSubmit: failed to retrieve pending modal options:', e?.message || e);
        if (typeof interaction.recruitPanelColor === 'string' && interaction.recruitPanelColor.length > 0) {
          panelColor = interaction.recruitPanelColor;
        } else if (guildSettings.defaultColor) {
          panelColor = guildSettings.defaultColor;
        } else {
          panelColor = undefined;
        }
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
  console.log('[handleModalSubmit] about to send recruit panel, recruitDataObj:', { title: recruitDataObj.title, participants: recruitDataObj.participants, recruiterId: recruitDataObj.recruiterId });
      
      // 1. メンション通知（ギルド設定があれば使用）
      if (guildSettings.notification_role) {
        // fire-and-forget: 通知は非同期で送信し、失敗はログに残す
        (async () => {
          try {
            await interaction.channel.send({ content: `新しい募集が作成されました。<@&${guildSettings.notification_role}>`, allowedMentions: { roles: [guildSettings.notification_role] } });
            console.log('ギルド設定の通知ロールで送信完了:', guildSettings.notification_role);
          } catch (e) {
            console.warn('通知送信失敗 (guild notification role):', e?.message || e);
          }
        })();
      } else {
        // デフォルトの通知（従来の処理） - 非同期送信
        (async () => {
          try {
            await interaction.channel.send({ content: '新しい募集が作成されました。<@&1416797165769986161>', allowedMentions: { roles: ['1416797165769986161'] } });
            console.log('デフォルト通知ロールで送信完了');
          } catch (e) {
            console.warn('通知送信失敗 (default role):', e?.message || e);
          }
        })();
      }

  // 2回目以降のtempRecruitId宣言を削除
      
      // ボタン付きメッセージを投稿（バッファから直接送信）
      const image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
      const participantText = `🎯✨ 参加リスト ✨🎯\n🎮 <@${interaction.user.id}>`;
      let panelColorForAccent = panelColor;
      if (typeof panelColorForAccent === 'string' && panelColorForAccent.startsWith('#')) {
        panelColorForAccent = panelColorForAccent.slice(1);
      }
      const accentColor = (panelColorForAccent && /^[0-9A-Fa-f]{6}$/.test(panelColorForAccent)) ? parseInt(panelColorForAccent, 16) : (guildSettings.defaultColor && /^[0-9A-Fa-f]{6}$/.test(guildSettings.defaultColor) ? parseInt(guildSettings.defaultColor, 16) : 0x000000);
      // container をヘルパーで生成（募集主＝作成者なので requesterId は interaction.user.id）
      // Debug: log color and id values used to build the initial container
      try {
        console.log('[debug] initial container values:', { panelColor, panelColorForAccent, accentColor: accentColor.toString(16), recruiterId: interaction.user.id, requesterId: interaction.user.id, guildDefault: guildSettings.defaultColor });
      } catch (e) {
        console.warn('debug log failed:', e?.message || e);
      }
      const container = buildContainer({ headerTitle: `${user.username}さんの募集`, participantText, recruitIdText: '(送信後決定)', accentColor, imageAttachmentName: 'attachment://recruit-card.png', recruiterId: interaction.user.id, requesterId: interaction.user.id });
      // メインチャンネル：通知が既に送信済みのはずなので、募集パネルを通常メッセージとして送信
      const followUpMessage = await interaction.channel.send({
        files: [image],
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { roles: [], users: [] }
      });
      // 確認用のephemeralレスポンス（deferReplyしているのでeditReplyでOK）
        try {
        await safeReply(interaction, { content: '募集を作成しました。', flags: MessageFlags.Ephemeral });
      } catch (e) {
        console.warn('safeReply failed (non-fatal):', e?.message || e);
      }

      // ギルド設定で募集チャンネルが設定されている場合、そちらにも送信
      if (guildSettings.recruit_channel && guildSettings.recruit_channel !== interaction.channelId) {
        try {
          const recruitChannel = await interaction.guild.channels.fetch(guildSettings.recruit_channel);
          if (recruitChannel && recruitChannel.isTextBased()) {
            // 通知ロールの準備
            if (guildSettings.notification_role) {
              (async () => {
                try {
                  await recruitChannel.send({ content: `新しい募集が作成されました。<@&${guildSettings.notification_role}>`, allowedMentions: { roles: [guildSettings.notification_role] } });
                  console.log('指定チャンネルに通知ロールで送信完了:', guildSettings.notification_role);
                } catch (e) {
                  console.warn('通知送信失敗 (指定チャンネル, role):', e?.message || e);
                }
              })();
            } else {
              (async () => {
                try {
                  await recruitChannel.send({ content: '新しい募集が作成されました。@unknown-role募集ぱねる', allowedMentions: { roles: [] } });
                  console.log('指定チャンネルにデフォルト通知で送信完了');
                } catch (e) {
                  console.warn('通知送信失敗 (指定チャンネル, default):', e?.message || e);
                }
              })();
            }
            
            (async () => {
              try {
                await recruitChannel.send({ files: [image], components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } });
                console.log('募集メッセージを指定チャンネルに送信しました:', guildSettings.recruit_channel);
              } catch (e) {
                console.warn('指定チャンネルへの募集メッセージ送信に失敗:', e?.message || e);
              }
            })();
          }
        } catch (channelError) {
          console.error('指定チャンネルへの送信でエラー:', channelError);
        }
      }

      // メッセージ送信後、実際のメッセージIDでrecruitIdを上書きし、保存・表示も必ず一致させる
      try {
  const actualMessage = followUpMessage; // メインチャンネルに投稿したメッセージを実メッセージとして扱う
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
          const pushRes = await pushRecruitToWebAPI(finalRecruitData);
          if (!pushRes || !pushRes.ok) {
            console.warn('Worker APIに募集データをpushできませんでした:', pushRes && (pushRes.status || pushRes.error));
          } else {
            console.log('Worker APIに募集データをpush: 成功');
          }
        } catch (err) {
          console.error('Redis保存またはAPI pushエラー:', err);
        }
        recruitParticipants.set(actualMessageId, [interaction.user.id]);
        // 初期参加者をRedisに保存
        try {
          await saveParticipantsToRedis(actualMessageId, [interaction.user.id]);
          console.log('初期参加者をRedisに保存しました:', actualMessageId);
        } catch (e) {
          console.warn('初期参加者のRedis保存に失敗:', e?.message || e);
        }
        console.log('Redisに保存しようとしたデータ:', finalRecruitData);
  // 新しい画像を生成（正しいメッセージIDを使用） - 色は finalRecruitData.panelColor を優先して統一
  const { generateRecruitCard } = require('../utils/canvasRecruit');
  let finalUseColor = finalRecruitData.panelColor ? finalRecruitData.panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000');
  if (typeof finalUseColor === 'string' && finalUseColor.startsWith('#')) finalUseColor = finalUseColor.slice(1);
  if (typeof finalUseColor !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(finalUseColor)) finalUseColor = '000000';
  const updatedImageBuffer = await generateRecruitCard(finalRecruitData, [interaction.user.id], interaction.client, finalUseColor);
  const updatedImage = new AttachmentBuilder(updatedImageBuffer, { name: 'recruit-card.png' });
  const finalAccentColor = /^[0-9A-Fa-f]{6}$/.test(finalUseColor) ? parseInt(finalUseColor, 16) : 0x000000;
  const updatedContainer = buildContainer({ headerTitle: `${user.username}さんの募集`, participantText, recruitIdText: actualRecruitId, accentColor: finalAccentColor, imageAttachmentName: 'attachment://recruit-card.png', recruiterId: interaction.user.id, requesterId: interaction.user.id });
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
        // 8時間後の自動締切タイマーを設定（重複を削除、未定義変数 recruitData -> recruitParticipants に修正）
        setTimeout(async () => {
          try {
            // メモリ上にまだ募集データが存在する場合のみ自動締切を実行
            if (recruitParticipants.has(actualMessageId)) {
              console.log('8時間経過による自動締切実行:', actualMessageId);
              try {
                await autoCloseRecruitment(interaction.client, interaction.guildId, interaction.channelId, actualMessageId);
              } catch (e) {
                console.error('autoCloseRecruitment failed:', e);
              }
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
      if (error && error.code === 10062) {
        // Discord側でインタラクションが期限切れ・Unknown interaction
        console.warn('インタラクションが期限切れまたはUnknown interactionです');
        return;
      }
      if (error && error.stack) console.error(error.stack);
      // 2重返信防止: replied/deferred両方判定
      if (!interaction.replied && !interaction.deferred) {
        try {
          await safeReply(interaction, { 
            content: `モーダル送信エラー: ${error.message || error}`, 
            flags: MessageFlags.Ephemeral,
            allowedMentions: { roles: [], users: [] }
          });
        } catch (e) {
          // それでも失敗した場合はログのみ
          console.error('二重応答防止: safeReply failed', e);
        }
      } else {
        try {
          await safeReply(interaction, { content: `モーダル送信エラー: ${error.message || error}` });
        } catch (e) {
          console.error('safeReply(edit) failed', e);
        }
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
    // ボタン処理は可能な限り即時応答（ephemeral reply）で返す。deferReply は使用しない。
  // KV化のためrecruitDataは参照しない
  console.log('保存されている参加者データのキー:', Array.from(recruitParticipants.keys()));
    
  // Lazy-hydrate participants from Redis if missing in memory
  let participants = recruitParticipants.get(messageId) || [];
  try {
    const persisted = await getParticipantsFromRedis(messageId);
    if (Array.isArray(persisted) && persisted.length > 0) {
      // Prefer persisted list if memory is empty
      if (!participants || participants.length === 0) {
        participants = persisted;
        recruitParticipants.set(messageId, participants);
        console.log('Redisから参加者リストを復元しました:', participants);
      }
    }
  } catch (e) {
    console.warn('参加者リスト復元に失敗:', e?.message || e);
  }
  console.log('現在の参加者リスト:', participants);
  const { getActiveRecruits, getGuildSettings } = require('../utils/db');
  // 最新の募集データはまず Redis から直接取得（外部 API 呼び出しを避け、レスポンスを高速化）
  let savedRecruitData = null;
  try {
    const recruitId = String(messageId).slice(-8);
    savedRecruitData = await getRecruitFromRedis(recruitId);
    if (!savedRecruitData) {
      // フォールバックで全件から探す（稀なケース）
      try {
        const all = await listRecruitsFromRedis();
        savedRecruitData = all.find(r => r && (r.message_id === messageId || r.messageId === messageId || r.recruitId === String(messageId).slice(-8)));
      } catch (e) {
        console.warn('listRecruitsFromRedis fallback failed:', e?.message || e);
      }
    }
  } catch (e) {
    console.warn('getRecruitFromRedis failed:', e?.message || e);
    savedRecruitData = null;
  }

  switch (interaction.customId) {
      case "join": {
        // すでに参加していなければ追加
        if (!participants.includes(interaction.user.id)) {
          participants.push(interaction.user.id);
          recruitParticipants.set(messageId, participants);
          console.log('参加者追加:', interaction.user.id, '現在の参加者:', participants);
          // Redisに保存（非同期で行い、応答をブロックしない）
          saveParticipantsToRedis(messageId, participants).catch(e => console.warn('参加者保存失敗 (async):', e?.message || e));

          // まずはユーザーに素早く応答
          try {
            // 常に safeReply を使って即時（エフェメラル）に応答する。deferReply は用いない。
            await safeReply(interaction, { content: '✅ 参加しました！', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
          } catch (e) {
            console.warn('quick reply failed:', e?.message || e);
          }

          // 募集主への通知はバックグラウンドで行う（ボタンクリック応答をブロックしない）
          if (savedRecruitData && savedRecruitData.recruiterId) {
            (async () => {
              try {
                const joinColor = (() => {
                  try {
                    const col = savedRecruitData?.panelColor || (guildSettings && guildSettings.defaultColor) || '000000';
                    const cleaned = (typeof col === 'string' && col.startsWith('#')) ? col.slice(1) : col;
                    return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : 0x00FF00;
                  } catch (_) { return 0x00FF00; }
                })();
                const joinEmbed = new EmbedBuilder()
                  .setColor(joinColor)
                  .setTitle('🎮 新しい参加者がいます！')
                  .setDescription(`<@${interaction.user.id}> が募集に参加しました！`)
                  .addFields(
                    { name: '募集タイトル', value: savedRecruitData.title, inline: false },
                    { name: '現在の参加者数', value: `${participants.length}/${savedRecruitData.participants}人`, inline: true }
                  )
                  .setTimestamp();

                const client = interaction.client;
                const recruiterUser = await client.users.fetch(savedRecruitData.recruiterId).catch(() => null);
                if (recruiterUser && recruiterUser.send) {
                  await recruiterUser.send({ content: `あなたの募集に参加者が増えました: ${savedRecruitData.title || ''}`, embeds: [joinEmbed] }).catch(() => null);
                } else {
                  // as fallback, try to send ephemeral reply to interaction (non-blocking)
                  console.log('[notify] recruiter not DMable, skipping DM');
                }
              } catch (e) {
                console.warn('background recruiter notify failed:', e?.message || e);
              }
            })();
          }
        } else {
          console.log('既に参加済み:', interaction.user.id);
          await safeReply(interaction, { 
            content: "❌ 既に参加済みです。", 
            flags: MessageFlags.Ephemeral,
            allowedMentions: { roles: [], users: [] }
          });
        }
  // 非同期で参加者リスト更新（レスポンスをブロックしない）
  updateParticipantList(interaction, participants, savedRecruitData).catch(e => console.warn('updateParticipantList failed (async):', e?.message || e));
        break;
      }
      case "cancel": {
        // 参加者から削除
  const beforeLength = participants.length;
  // 募集主の場合は特別な処理
  if (savedRecruitData && savedRecruitData.recruiterId === interaction.user.id) {
          await safeReply(interaction, { 
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
          // Redis に非同期で保存（応答をブロックしない）
          saveParticipantsToRedis(messageId, participants).catch(e => console.warn('参加者保存失敗 (async):', e?.message || e));

          // ユーザーへ素早く応答
          try {
            // 常に safeReply を使って即時（エフェメラル）に応答する。deferReply は用いない。
            await safeReply(interaction, { content: '✅ 参加を取り消しました。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
          } catch (e) {
            console.warn('quick cancel reply failed:', e?.message || e);
          }

          // 募集主への通知はバックグラウンドで行う
          if (savedRecruitData && savedRecruitData.recruiterId) {
            (async () => {
              try {
                const cancelColor = (() => {
                  try {
                    const col = savedRecruitData?.panelColor || (guildSettings && guildSettings.defaultColor) || '000000';
                    const cleaned = (typeof col === 'string' && col.startsWith('#')) ? col.slice(1) : col;
                    return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : 0xFF6B35;
                  } catch (_) { return 0xFF6B35; }
                })();
                const cancelEmbed = new EmbedBuilder()
                  .setColor(cancelColor)
                  .setTitle('📤 参加者がキャンセルしました')
                  .setDescription(`<@${interaction.user.id}> が募集から離脱しました。`)
                  .addFields(
                    { name: '募集タイトル', value: savedRecruitData.title, inline: false },
                    { name: '現在の参加者数', value: `${participants.length}/${savedRecruitData.participants}人`, inline: true }
                  )
                  .setTimestamp();

                const client = interaction.client;
                const recruiterUser = await client.users.fetch(savedRecruitData.recruiterId).catch(() => null);
                if (recruiterUser && recruiterUser.send) {
                  await recruiterUser.send({ content: `あなたの募集から参加者が離脱しました: ${savedRecruitData.title || ''}`, embeds: [cancelEmbed] }).catch(() => null);
                }
              } catch (e) {
                console.warn('background cancel notify failed:', e?.message || e);
              }
            })();
          }
        } else {
          // 元々参加していない場合
          await safeReply(interaction, {
            content: "❌ 参加していないため、取り消せません。",
            flags: MessageFlags.Ephemeral,
            allowedMentions: { roles: [], users: [] }
          });
        }
  // 非同期で参加者リスト更新（レスポンスをブロックしない）
  updateParticipantList(interaction, participants, savedRecruitData).catch(e => console.warn('updateParticipantList failed (async):', e?.message || e));
        break;
      }
      case "close": {
        {
          const messageId = interaction.message.id;
          // 締め処理は募集主のみ許可する
          try {
            if (!savedRecruitData) {
              // Redis からフォールバックで取得を試みる
              try {
                const fromRedis = await getRecruitFromRedis(String(messageId).slice(-8));
                if (fromRedis) savedRecruitData = fromRedis;
              } catch (e) {
                console.warn('close: getRecruitFromRedis failed:', e?.message || e);
              }
            }
          } catch (e) {
            console.warn('close: recruiter check preparation failed:', e?.message || e);
          }
          if (!savedRecruitData) {
            await safeReply(interaction, { content: '❌ 募集データが見つからないため締め切れません。', flags: MessageFlags.Ephemeral });
            return;
          }
          if (savedRecruitData.recruiterId !== interaction.user.id) {
            await safeReply(interaction, { content: '❌ 締め切りを実行できるのは募集主のみです。', flags: MessageFlags.Ephemeral });
            return;
          }
          // === 募集状況をAPI経由で削除 ===
          const { deleteRecruitmentData, updateRecruitmentStatus } = require('../utils/db');
          // API 側で見つからない（404）などのケースがあるため例外を吸収して処理を継続する
          try {
            const delRes = await deleteRecruitmentData(messageId);
            if (delRes && delRes.ok) {
              console.log('管理API: 募集データを削除しました:', messageId);
            } else if (delRes && delRes.status === 404) {
              console.warn('管理APIで募集データが見つかりませんでした（404）。処理を続行します:', messageId);
            } else {
              console.warn('管理API: 募集データ削除の結果が不正です:', delRes);
            }
          } catch (err) {
            console.error('募集データの削除に失敗:', err);
          }
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
            const closeColor = (() => {
              try {
                const col = savedRecruitData?.panelColor || (guildSettings && guildSettings.defaultColor) || '808080';
                const cleaned = (typeof col === 'string' && col.startsWith('#')) ? col.slice(1) : col;
                return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : 0x808080;
              } catch (_) { return 0x808080; }
            })();
            const closeEmbed = new EmbedBuilder()
              .setColor(closeColor)
              .setTitle('🔒 募集締切')
              .setDescription(`**${savedRecruitData.title}** の募集を締め切りました。`)
              .addFields(
                { name: '最終参加者数', value: `${finalParticipants.length}/${savedRecruitData.participants}人`, inline: false }
              );
            try {
              await safeReply(interaction, {
                content: `<@${savedRecruitData.recruiterId}>`,
                embeds: [closeEmbed],
                allowedMentions: { users: [savedRecruitData.recruiterId] }
              });
            } catch (e) {
              console.warn('safeReply failed during close handling:', e?.message || e);
            }
            // メモリからデータを削除（自動締切タイマーもクリア）
              // メモリからデータを削除
              recruitParticipants.delete(messageId);
              // Redisからも削除
              try { await deleteParticipantsFromRedis(messageId); } catch (e) { console.warn('Redis参加者削除失敗:', e?.message || e); }
              console.log('手動締切完了、メモリとRedisからデータを削除:', messageId);
          } else {
            // フォールバック
            await safeReply(interaction, { 
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
