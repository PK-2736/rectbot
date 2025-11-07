const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { pendingModalOptions } = require('./state');
const { safeReply } = require('../../utils/safeReply');
const { listRecruitsFromRedis, getCooldownRemaining } = require('../../utils/db');
const { EXEMPT_GUILD_IDS } = require('./constants');
const { getGuildSettings } = require('../../utils/db');

// execute handler split from gameRecruit.js
async function execute(interaction) {
  console.log('[gameRecruit.execute] invoked by', interaction.user?.id, 'guild:', interaction.guildId, 'channel:', interaction.channelId);

  // Guild-level cooldown pre-check (2 minutes), except exempt guilds
  try {
    if (!EXEMPT_GUILD_IDS.has(String(interaction.guildId))) {
      const remaining = await getCooldownRemaining(`rect:${interaction.guildId}`);
      if (remaining > 0) {
        const mm = Math.floor(remaining / 60);
        const ss = remaining % 60;
        await safeReply(interaction, {
          content: `⏳ このサーバーの募集コマンドはクールダウン中です。あと ${mm}:${ss.toString().padStart(2, '0')} 待ってから再度お試しください。`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return;
      }
    }
  } catch (e) {
    console.warn('[rect cooldown pre-check] failed:', e?.message || e);
  }

  if (!EXEMPT_GUILD_IDS.has(String(interaction.guildId))) {
    const allRecruits = await listRecruitsFromRedis();
    console.log('[gameRecruit.execute] listRecruitsFromRedis returned count:', Array.isArray(allRecruits) ? allRecruits.length : typeof allRecruits);
    const guildIdStr = String(interaction.guildId);
    let matched = [];
    if (Array.isArray(allRecruits)) {
      matched = allRecruits.filter(r => {
        const gid = String(r?.guildId ?? r?.guild_id ?? r?.guild ?? r?.metadata?.guildId ?? r?.metadata?.guild ?? '');
        const status = String(r?.status ?? '').toLowerCase();
        return gid === guildIdStr && (status === 'recruiting' || status === 'active');
      });
    }
    console.log('[gameRecruit.execute] matched active recruits for guild:', matched.map(m => m?.recruitId || m?.message_id || m?.recruit_id || '(no-id)'));
    const guildActiveCount = matched.length;
    if (guildActiveCount >= 1) {
      console.log('[gameRecruit.execute] blocking create due to existing active recruit');
      await safeReply(interaction, {
        content: '❌ このサーバーでは同時に実行できる募集は1件までです。既存の募集を締め切ってから新しい募集を作成してください。',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return;
    }
  }

  try {
    // ギルド設定
    const guildSettings = await getGuildSettings(interaction.guildId);
    console.log('[gameRecruit.execute] guildSettings for', interaction.guildId, ':', guildSettings && { recruit_channel: guildSettings.recruit_channel, defaultTitle: guildSettings.defaultTitle });

    // 募集チャンネル強制
    if (guildSettings.recruit_channel && guildSettings.recruit_channel !== interaction.channelId) {
      console.log('[gameRecruit.execute] blocking create due to channel mismatch. required:', guildSettings.recruit_channel, 'current:', interaction.channelId);
      return await safeReply(interaction, {
        content: `❌ 募集はこのチャンネルでは実行できません。\n📍 募集専用チャンネル: <#${guildSettings.recruit_channel}>`,
        flags: MessageFlags.Ephemeral
      });
    }

    // 色オプション
    let selectedColor = interaction.options.getString('色') || undefined;

    // 通知ロール（任意）を一旦バリデーション（設定済みロールのみ可）
    const selectedRoleObj = interaction.options.getRole('通知ロール');
    let selectedRoleId = selectedRoleObj ? String(selectedRoleObj.id) : null;
    if (selectedRoleId) {
      const configuredNotificationRoleIds = (() => {
        const roles = [];
        if (Array.isArray(guildSettings.notification_roles)) roles.push(...guildSettings.notification_roles.filter(Boolean));
        if (guildSettings.notification_role) roles.push(guildSettings.notification_role);
        return [...new Set(roles.map(String))].slice(0, 25);
      })();
      if (configuredNotificationRoleIds.length === 0 || !configuredNotificationRoleIds.includes(selectedRoleId)) {
        await safeReply(interaction, {
          content: '❌ このロールを付けて募集を実行することはできません。サーバーの「通知ロール」に登録されているロールのみ指定できます。',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return;
      }
    }

    // 一時保存（モーダル→別インタラクションになるため）
    try {
      if (interaction.user && interaction.user.id) {
        const prev = pendingModalOptions.get(interaction.user.id) || {};
        pendingModalOptions.set(interaction.user.id, { ...prev, panelColor: selectedColor, notificationRoleId: selectedRoleId });
      }
    } catch (e) {
      console.warn('pendingModalOptions set failed:', e?.message || e);
    }

    // モーダル表示
    console.log('[gameRecruit.execute] showing modal for user:', interaction.user?.id);
    const modal = new ModalBuilder().setCustomId('recruitModal').setTitle('🎮 募集内容入力');
    const titleInput = new TextInputBuilder().setCustomId('title').setLabel('タイトル（例: スプラトゥーン3 ガチマッチ募集）').setStyle(TextInputStyle.Short).setRequired(true);
    if (guildSettings.defaultTitle) titleInput.setValue(guildSettings.defaultTitle);
    const contentInput = new TextInputBuilder().setCustomId('content').setLabel('募集内容（例: ガチエリア / 初心者歓迎 / 2時間）').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('詳細な募集内容を入力してください...');
    const participantsInput = new TextInputBuilder().setCustomId('participants').setLabel('参加人数（例: 4）').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(2).setPlaceholder('1-16の数字を入力してください');
    const timeInput = new TextInputBuilder().setCustomId('startTime').setLabel('開始時間（例: 21:00）').setStyle(TextInputStyle.Short).setRequired(true);
    const vcInput = new TextInputBuilder().setCustomId('vc').setLabel('VCの有無（あり / なし）').setStyle(TextInputStyle.Short).setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(contentInput),
      new ActionRowBuilder().addComponents(participantsInput),
      new ActionRowBuilder().addComponents(timeInput),
      new ActionRowBuilder().addComponents(vcInput)
    );

    await interaction.showModal(modal);
    console.log('[gameRecruit.execute] showModal called successfully for', interaction.user?.id);
  } catch (error) {
    console.error('Modal display error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'モーダル表示エラーが発生しました。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
    }
  }
}

module.exports = { execute };
