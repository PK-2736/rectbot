const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, LabelBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder } = require('discord.js');
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
      await safeReply(interaction, { content: '❌ 開始時間（HH:mm）または「今から」を指定してください。', flags: MessageFlags.Ephemeral });
      return;
    }

    // 色オプション（既存互換）
    let selectedColor = interaction.options.getString('色') || undefined;

    // 入力バリデーション: 開始時間
    const hhmm = /^\s*(\d{1,2}):(\d{2})\s*$/;
    const isNow = /^\s*(今から|now)\s*$/i.test(String(startArg));
    if (!isNow && !hhmm.test(String(startArg))) {
      await safeReply(interaction, { content: '❌ 開始時間は HH:mm の形式、または「今から」で指定してください（例: 21:00 ／ 今から）。', flags: MessageFlags.Ephemeral });
      return;
    }

    // 開始時刻のパース（HH:mm）→ 直近の将来日時に補正
    let startAtISO = null;
    try {
      if (isNow) {
        const now = new Date();
        now.setSeconds(0, 0);
        startAtISO = now.toISOString();
      } else {
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
      }
    } catch (_) {}



    // 一時保存（モーダル→別インタラクションになるため）
    try {
      if (interaction.user && interaction.user.id) {
        const prev = pendingModalOptions.get(interaction.user.id) || {};
        pendingModalOptions.set(interaction.user.id, {
          ...prev,
          panelColor: selectedColor,
          title: titleArg,
          participants: membersArg,
          startTime: startArg, // 表示用
          startAt: startAtISO, // 予約実行用
          voice: typeof voiceArg === 'boolean' ? voiceArg : null,
          voicePlace: voicePlaceArg,
          voiceChannelId: voiceChannelId
        });
        console.log('[gameRecruit.execute] saved to pendingModalOptions:', {
          userId: interaction.user.id,
          title: titleArg,
          participants: membersArg,
          startTime: startArg,
          panelColor: selectedColor
        });
      }
    } catch (e) {
      console.warn('pendingModalOptions set failed:', e?.message || e);
    }

    // モーダル表示(内容+既存参加者+通知ロール)
    console.log('[gameRecruit.execute] showing modal for user:', interaction.user?.id);
    const modal = new ModalBuilder().setCustomId('recruitModal').setTitle('🎮 募集内容入力');
    
    // 既存参加者選択 (UserSelectMenu) - デフォルトで募集開始者を含む
    const existingMembersSelect = new LabelBuilder()
      .setLabel('既存参加者（任意）')
      .setUserSelectMenuComponent(
        new UserSelectMenuBuilder()
          .setCustomId('existingMembers')
          .setPlaceholder('既に参加しているメンバーを選択')
          .setRequired(false)
          .setMinValues(0)
          .setMaxValues(15)
          .setDefaultUsers([interaction.user.id]) // デフォルトで募集開始者を選択
      );

    // 通知ロール選択 (StringSelectMenu) - 設定されたロールのみを選択肢に
    const configuredNotificationRoleIds = (() => {
      const roles = [];
      if (Array.isArray(guildSettings.notification_roles)) roles.push(...guildSettings.notification_roles.filter(Boolean));
      if (guildSettings.notification_role) roles.push(guildSettings.notification_role);
      return [...new Set(roles.map(String))].filter(Boolean);
    })();

    // 通知ロール選択メニューを常に追加（設定なしの場合は「通知なし」のみ）
    const roleOptions = [];
    
    // 「通知なし」オプションを最初に追加
    roleOptions.push({
      label: '通知ロールなし',
      value: 'none',
      description: '通知ロールを使用せずに募集します',
      default: true
    });

    // @everyone と @here を追加
    roleOptions.push({
      label: '@everyone',
      value: 'everyone',
      description: 'サーバー全員に通知'
    });
    roleOptions.push({
      label: '@here',
      value: 'here',
      description: 'オンライン中のメンバーに通知'
    });

    // 設定されたロールがある場合のみロール情報を追加
    if (configuredNotificationRoleIds.length > 0) {
      for (const roleId of configuredNotificationRoleIds.slice(0, 22)) { // @everyone, @here分を考慮して22に
        try {
          const role = await interaction.guild.roles.fetch(roleId);
          if (role) {
            roleOptions.push({
              label: role.name.slice(0, 100),
              value: roleId,
              description: `通知ロール: ${role.name}`.slice(0, 100)
            });
          }
        } catch (e) {
          console.warn('[gameRecruit.execute] failed to fetch role:', roleId, e?.message);
        }
      }
    }

    // 通知ロール選択メニューを常に追加
    const notificationRoleSelect = new LabelBuilder()
      .setLabel('通知ロール（任意）')
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId('notificationRole')
          .setPlaceholder('通知するロールを選択')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(roleOptions)
      );

    // 募集内容のテキスト入力
    const contentInput = new LabelBuilder()
      .setLabel('募集内容')
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('content')
          .setPlaceholder('例: ガチエリア / 初心者歓迎 / 2時間')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      );

    // モーダルコンポーネントの順番: 既存参加者 → 通知ロール → 募集内容
    const modalComponents = [existingMembersSelect, notificationRoleSelect, contentInput];

    modal.addComponents(...modalComponents);

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
