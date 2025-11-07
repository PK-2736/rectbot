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
