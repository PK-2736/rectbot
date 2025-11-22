const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { UserSelectMenuBuilder } = require('@discordjs/builders');
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

    // スラッシュ引数の取得（日本語/英語両対応、必須でも例外にしない）
    const optStr = (name) => { try { return interaction.options.getString(name); } catch { return null; } };
    const optInt = (name) => { try { return interaction.options.getInteger(name); } catch { return null; } };
    const optBool = (name) => { try { return interaction.options.getBoolean(name); } catch { return null; } };
    const optChan = (name) => { try { return interaction.options.getChannel(name); } catch { return null; } };

    const titleArg = optStr('タイトル') ?? optStr('title');
    const membersArg = optInt('人数') ?? optInt('members');
    const startArg = optStr('開始時間') ?? optStr('start');
    const voiceArg = optBool('通話有無') ?? optBool('voice'); // true/false/undefined
    const voiceChannel = optChan('通話場所');
    const legacyVoicePlace = optStr('voice_place');
    const voicePlaceArg = voiceChannel
      ? voiceChannel.name
      : (legacyVoicePlace || null);
    const voiceChannelId = voiceChannel ? voiceChannel.id : null;

    // 必須不足チェック（例外ではなくエフェメラル返信で案内）
    if (!titleArg) {
      await safeReply(interaction, { content: '❌ タイトルを指定してください。', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!membersArg || membersArg < 1 || membersArg > 16) {
      await safeReply(interaction, { content: '❌ 人数は1〜16の範囲で指定してください。', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!startArg) {
      await safeReply(interaction, { content: '❌ 開始時間（HH:mm）を指定してください。', flags: MessageFlags.Ephemeral });
      return;
    }

    // 色オプション（既存互換）
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

    // 入力バリデーション: 開始時間
    const hhmm = /^\s*(\d{1,2}):(\d{2})\s*$/;
    if (!hhmm.test(String(startArg))) {
      await safeReply(interaction, { content: '❌ 開始時間は HH:mm の形式で入力してください（例: 21:00）。', flags: MessageFlags.Ephemeral });
      return;
    }

    // 開始時刻のパース（HH:mm）→ 直近の将来日時に補正
    let startAtISO = null;
    try {
      const m = String(startArg).match(hhmm);
      if (m) {
        const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
        const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
        const now = new Date();
        const startAt = new Date(now);
        startAt.setSeconds(0, 0);
        startAt.setHours(hh, mm, 0, 0);
        if (startAt.getTime() <= now.getTime()) {
          // すでに過ぎている場合は翌日に
          startAt.setDate(startAt.getDate() + 1);
        }
        startAtISO = startAt.toISOString();
      }
    } catch (_) {}



    // 一時保存（モーダル→別インタラクションになるため）
    try {
      if (interaction.user && interaction.user.id) {
        const prev = pendingModalOptions.get(interaction.user.id) || {};
        pendingModalOptions.set(interaction.user.id, {
          ...prev,
          panelColor: selectedColor,
          notificationRoleId: selectedRoleId,
          title: titleArg,
          participants: membersArg,
          startTime: startArg, // 表示用
          startAt: startAtISO, // 予約実行用
          voice: typeof voiceArg === 'boolean' ? voiceArg : null,
          voicePlace: voicePlaceArg,
          voiceChannelId: voiceChannelId
        });
      }
    } catch (e) {
      console.warn('pendingModalOptions set failed:', e?.message || e);
    }

    // モーダル表示(内容のみ)
    console.log('[gameRecruit.execute] showing modal for user:', interaction.user?.id);
    const modal = new ModalBuilder().setCustomId('recruitModal').setTitle('🎮 募集内容入力');
    
    const contentInput = new TextInputBuilder()
      .setCustomId('content')
      .setLabel('募集内容（例: ガチエリア / 初心者歓迎 / 2時間）')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000)
      .setPlaceholder('詳細な募集内容を入力してください...');

    // 既存参加者選択 (UserSelectMenu)
    const existingMembersSelect = new UserSelectMenuBuilder()
      .setCustomId('existingMembers')
      .setPlaceholder('既存参加者を選択（任意）')
      .setMinValues(0)
      .setMaxValues(15);

    modal.addComponents(
      new ActionRowBuilder().addComponents(contentInput),
      new ActionRowBuilder().addComponents(existingMembersSelect)
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
