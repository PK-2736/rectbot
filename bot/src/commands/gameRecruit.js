const {
  SlashCommandBuilder,
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder,
  AttachmentBuilder, SectionBuilder, EmbedBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType
} = require('discord.js');
// Components v2 で画像をインライン表示するためのビルダー
const { ThumbnailBuilder } = require('@discordjs/builders');
const path = require('path');
const fs = require('fs');
// externalized shared state and helpers
const { recruitParticipants, pendingModalOptions, __hydrateParticipants } = require('./gameRecruit/state');
const { safeReply } = require('../utils/safeReply');
const { updateParticipantList, autoCloseRecruitment } = require('../utils/recruitMessage');

// hydrateRecruitData moved to utils/recruitMessage

// autoCloseRecruitment moved to utils/recruitMessage

// safeReply moved to ../utils/safeReply

// Redis専用 募集データAPI
const { saveRecruitToRedis, getRecruitFromRedis, listRecruitsFromRedis, deleteRecruitFromRedis, pushRecruitToWebAPI, getGuildSettings, saveParticipantsToRedis, getParticipantsFromRedis, deleteParticipantsFromRedis } = require('../utils/db');
const { buildContainer, sendChannelNotification } = require('../utils/recruitHelpers');

// updateParticipantList moved to ../utils/recruitMessage

module.exports = {
  // export in-memory map and hydration helper so index.js can hydrate on startup
  recruitParticipants,
  __hydrateParticipants,
  autoCloseRecruitment,
  // このコマンドは初手でモーダルを表示するため、deferReplyを行わない
  noDefer: true,
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
    // 必須: 募集人数（必須は任意より前に定義する必要あり）
    .addIntegerOption(option =>
      option.setName('人数')
        .setDescription('募集人数（必須）1-16')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(16)
    )
    // 必須: 開始時間（HH:mm 24時間表記）
    .addStringOption(option =>
      option.setName('開始時間')
        .setDescription('開始時間（必須）例: 21:00（24時間表記）')
        .setRequired(true)
    )
    // 募集タイトル（必須）
    .addStringOption(option =>
      option.setName('タイトル')
        .setDescription('募集タイトル（必須）')
        .setRequired(true)
        .setAutocomplete(true)
    )
    // 任意: 通話の有無（true/false）
    .addBooleanOption(option =>
      option.setName('通話有無')
        .setDescription('通話の有無（任意）')
        .setRequired(false)
    )
    // 任意: 通話場所（サーバーのボイスチャンネル）
    .addChannelOption(option =>
      option.setName('通話場所')
        .setDescription('通話で使うボイスチャンネル（任意）')
        .addChannelTypes(2, 13) // GuildVoice=2, GuildStageVoice=13
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('色')
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
    )
    .addRoleOption(option =>
      option.setName('通知ロール')
        .setDescription('募集作成時に通知するロール（任意）')
        .setRequired(false)
    ),
  async execute(interaction) {
    // Delegate to extracted handler
    const { execute } = require('./gameRecruit/execute');
    return execute(interaction);
  },

  // モーダル送信後の処理（interactionCreateイベントで呼び出し）
  async handleModalSubmit(interaction) {
    // Delegate to extracted handler
    const { handleModalSubmit } = require('./gameRecruit/handlers');
    return handleModalSubmit(interaction);
  },

  // ボタンインタラクションの処理
  async handleButton(interaction) {
    // Delegate to extracted handler
    const { handleButton } = require('./gameRecruit/handlers');
    return handleButton(interaction);
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
