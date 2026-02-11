const {
  PermissionFlagsBits,
  PermissionsBitField,
  MessageFlags,
  ChannelType,
} = require('discord.js');

const { saveGuildSettingsToRedis, getGuildSettingsFromRedis, getGuildSettingsSmart, finalizeGuildSettings, upsertTemplate } = require('../../utils/db');
const { safeReply } = require('../../utils/safeReply');
const { createErrorEmbed, createSuccessEmbed } = require('../../utils/embedHelpers');
const {
  showSettingsUI,
  showSettingsCategoryUI,
  showChannelSelect,
  showRoleSelect,
  showTitleModal,
  showColorModal,
} = require('./ui');

// 管理者判定を一元化（Administrator / ManageGuild / ギルドオーナーを許可）
async function isAdminUser(interaction) {
  if (!interaction || !interaction.guild) return false;

  // ギルドオーナーは常に許可
  if (interaction.user?.id && interaction.guild?.ownerId && interaction.user.id === interaction.guild.ownerId) {
    return true;
  }

  const normalizePerms = (perms) => {
    try {
      if (!perms) return null;
      if (typeof perms.has === 'function') return perms;
      return new PermissionsBitField(perms);
    } catch (_) {
      return null;
    }
  };

  const hasAdminFlag = (perms) => {
    if (!perms || typeof perms.has !== 'function') return false;
    return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
  };

  const candidates = [
    normalizePerms(interaction.memberPermissions),
    normalizePerms(interaction.member?.permissions),
  ];

  for (const perms of candidates) {
    if (hasAdminFlag(perms)) return true;
  }

  // GuildMembers intentなし環境では fetch が失敗するため、フェッチは行わずここで終了
  return false;
}

async function execute(interaction) {
  try {
    const isAdmin = await isAdminUser(interaction);
    const currentSettings = await getGuildSettingsSmart(interaction.guildId);
    await showSettingsUI(interaction, currentSettings, isAdmin);
  } catch (error) {
    console.error('Guild settings command error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { embeds: [createErrorEmbed('設定画面の表示でエラーが発生しました。')], flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleButtonInteraction(interaction) {
  const { customId } = interaction;
  console.log(`[guildSettings] Button pressed: ${customId}`);
  try {
    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    switch (customId) {
      case 'set_update_channel':
        await showChannelSelect(interaction, 'update_channel', '📢 アップデート通知チャンネルを選択してください');
        break;
      case 'set_recruit_channel':
      case 'set_recruit_channels':
        await showChannelSelect(interaction, 'recruit_channels', '📍 募集可能チャンネルを選択してください（複数可）', { maxValues: 10, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum] });
        break;
      case 'set_notification_role':
        await showRoleSelect(interaction, 'notification_roles', '🔔 通知ロールを選択してください');
        break;
      case 'set_default_title':
        await showTitleModal(interaction);
        break;
      case 'set_default_color':
        await showColorModal(interaction);
        break;
      case 'toggle_everyone':
        await toggleSpecialMention(interaction, 'everyone');
        break;
      case 'toggle_here':
        await toggleSpecialMention(interaction, 'here');
        break;
      case 'reset_all_settings':
        await resetAllSettings(interaction);
        break;
      case 'finalize_settings':
        await finalizeSettingsHandler(interaction);
        break;
      case 'toggle_recruit_style':
        await toggleRecruitStyle(interaction);
        break;
      case 'toggle_dedicated_channel':
        await toggleDedicatedChannel(interaction);
        break;
      case 'create_template':
        await safeReply(interaction, { 
          content: '🚧 この機能は現在作成中のため使用できません。\nしばらくお待ちください。', 
          flags: MessageFlags.Ephemeral 
        });
        break;
      case 'set_dedicated_category':
        await showChannelSelect(interaction, 'dedicated_channel_category_id', '📂 専用チャンネル用カテゴリを選択してください', { maxValues: 1, channelTypes: [ChannelType.GuildCategory] });
        break;
    }
  } catch (error) {
    console.error('[guildSettings] Button interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ 処理中にエラーが発生しました。', flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleSelectMenuInteraction(interaction) {
  const { customId, values } = interaction;
  try {
    // 設定カテゴリメニュー
    if (customId === 'settings_category_menu') {
      const category = values[0];
      const currentSettings = await getGuildSettingsSmart(interaction.guildId);
      const isAdmin = await isAdminUser(interaction);
      await showSettingsCategoryUI(interaction, category, currentSettings, isAdmin);
      return;
    }

    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('channel_select_')) {
      const settingType = customId.replace('channel_select_', '');
      if (settingType === 'recruit_channels') {
        const channelIds = Array.isArray(values) ? values : [];
        await updateGuildSetting(interaction, settingType, channelIds);
      } else if (settingType === 'dedicated_channel_category_id') {
        const categoryId = Array.isArray(values) && values.length > 0 ? values[0] : null;
        await updateGuildSetting(interaction, settingType, categoryId);
      } else {
        const channelId = values[0];
        await updateGuildSetting(interaction, settingType, channelId);
      }
    } else if (customId.startsWith('role_select_')) {
      const settingType = customId.replace('role_select_', '');
      const roleIds = Array.isArray(values) ? values : [];
      
      // 現在のeveryone/here設定を取得して保持
      const currentSettings = await getGuildSettingsFromRedis(interaction.guildId);
      const existingRoles = Array.isArray(currentSettings.notification_roles)
        ? currentSettings.notification_roles.filter(Boolean).map(String)
        : [];
      const specialMentions = existingRoles.filter(r => r === 'everyone' || r === 'here');
      
      // 実際のロールIDと特殊メンションを結合
      const mergedRoles = [...specialMentions, ...roleIds];
      
      await updateGuildSetting(interaction, settingType, mergedRoles);
    }
  } catch (error) {
    console.error('Select menu interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ 設定の更新でエラーが発生しました。', flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleModalSubmit(interaction) {
  const { customId } = interaction;
  try {
    await interaction.deferReply({ ephemeral: true });
    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await interaction.editReply({ content: '❌ この操作を実行するには「管理者」権限が必要です。' });
    }
    if (customId === 'default_title_modal') {
      const title = interaction.fields.getTextInputValue('default_title');
      await updateGuildSetting(interaction, 'defaultTitle', title);
    } else if (customId === 'default_color_modal') {
      const color = interaction.fields.getTextInputValue('default_color');
      if (color && !/^[0-9A-Fa-f]{6}$/.test(color)) {
        return await interaction.editReply({ embeds: [createErrorEmbed('無効なカラーコードです。6桁の16進数（例: 5865F2）を入力してください。', '入力エラー')] });
      }
      await updateGuildSetting(interaction, 'defaultColor', color);
    } else if (customId === 'template_create_modal') {
      const name = interaction.fields.getTextInputValue('template_name');
      const title = interaction.fields.getTextInputValue('template_title');
      const membersRaw = interaction.fields.getTextInputValue('template_members');

      const parseIntSafe = (val) => {
        const num = Number(val);
        return Number.isFinite(num) ? Math.trunc(num) : NaN;
      };

      const memberCount = parseIntSafe(membersRaw);
      if (!Number.isFinite(memberCount) || memberCount < 1 || memberCount > 16) {
        return await interaction.editReply({ embeds: [createErrorEmbed('募集人数は1〜16の数字で入力してください。', '入力エラー')] });
      }

      // 必須項目を検証したら、カラー選択メニューを表示
      await interaction.editReply({ embeds: [createSuccessEmbed('必須項目を確認しました。次にカラーを選択してください。', 'ステップ1/3完了')] });

      const templateData = { name, title, participants: memberCount };
      interaction.templateData = templateData;

      setTimeout(async () => {
        try {
          const { showTemplateColorSelect, showTemplateNotificationRoleSelect, showTemplateOptionalModal } = require('./ui');
          const color = await showTemplateColorSelect(interaction);
          if (!color) return;
          templateData.color = color;
          interaction.templateData = templateData;

          const roleId = await showTemplateNotificationRoleSelect(interaction, templateData);
          if (!roleId) return;
          templateData.notificationRoleId = roleId;
          interaction.templateData = templateData;

          await showTemplateOptionalModal(interaction, templateData);
        } catch (err) {
          console.error('[guildSettings] template flow error:', err);
        }
      }, 400);

    } else if (customId === 'template_optional_modal') {
      const content = interaction.fields.getTextInputValue('template_content') || null;
      const startTime = interaction.fields.getTextInputValue('template_start_time') || null;
      const regulationRaw = interaction.fields.getTextInputValue('template_regulation') || null;
      const voicePlace = interaction.fields.getTextInputValue('template_voice_place') || null;
      const voiceOption = interaction.fields.getTextInputValue('template_voice_option') || null;

      const parseIntSafe = (val) => {
        const num = Number(val);
        return Number.isFinite(num) ? Math.trunc(num) : NaN;
      };

      let regulationMembers = null;
      if (regulationRaw) {
        const num = parseIntSafe(regulationRaw);
        if (Number.isFinite(num) && num > 0 && num <= 99) {
          regulationMembers = num;
        }
      }

      // interaction.templateData から前のステップで保存したデータを取得
      const baseData = interaction.templateData || {};

      try {
        await upsertTemplate({
          guildId: interaction.guildId,
          createdBy: interaction.user?.id,
          name: baseData.name,
          title: baseData.title,
          participants: baseData.participants,
          color: baseData.color,
          notificationRoleId: baseData.notificationRoleId,
          content: content?.slice(0, 200),
          startTimeText: startTime?.slice(0, 100),
          regulationMembers,
          voicePlace: voicePlace?.slice(0, 100),
          voiceOption: voiceOption?.slice(0, 50),
        });
      } catch (error) {
        console.error('Template upsert error:', error);
        return await interaction.editReply({ embeds: [createErrorEmbed('テンプレートの保存に失敗しました。時間をおいて再度お試しください。', '保存エラー')] });
      }

      await interaction.editReply({ embeds: [createSuccessEmbed('テンプレートを保存しました！✨\n\n次回からこのテンプレートを使って素早く募集を開始できます。', '募集テンプレート完成')] });
    }
  } catch (error) {
    console.error('Modal submit error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.editReply({ content: '❌ 設定の更新でエラーが発生しました。' });
    }
  }
}

async function updateGuildSetting(interaction, settingKey, value) {
  try {
    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.guildId;
    let payload = { [settingKey]: value };

    if (settingKey === 'notification_roles') {
      const uniqueRoles = Array.isArray(value) ? [...new Set(value.filter(Boolean).map(String))] : [];
      payload = { notification_roles: uniqueRoles, notification_role: uniqueRoles.length > 0 ? uniqueRoles[0] : null };
    } else if (settingKey === 'notification_role') {
      const roleId = value ? String(value) : null;
      payload = { notification_role: roleId, notification_roles: roleId ? [roleId] : [] };
    } else if (settingKey === 'recruit_channels') {
      const uniqueChannels = Array.isArray(value) ? [...new Set(value.filter(Boolean).map(String))].slice(0, 25) : [];
      payload = { recruit_channels: uniqueChannels, recruit_channel: uniqueChannels.length > 0 ? uniqueChannels[0] : null };
    } else if (settingKey === 'enable_dedicated_channel') {
      payload = { enable_dedicated_channel: !!value };
    } else if (settingKey === 'dedicated_channel_category_id') {
      payload = { dedicated_channel_category_id: value ? String(value) : null };
    }

    await saveGuildSettingsToRedis(guildId, payload);

    const settingNames = {
      recruit_channel: '募集チャンネル',
      notification_roles: '通知ロール',
      notification_role: '通知ロール',
      defaultTitle: '既定タイトル',
      defaultColor: '既定カラー',
        update_channel: 'アップデート通知チャンネル',
      recruit_channels: '募集可能チャンネル',
      enable_dedicated_channel: '専用チャンネルボタン',
      dedicated_channel_category_id: '専用チャンネルカテゴリ',
    };

    const settingName = settingNames[settingKey] || settingKey;
    await safeReply(interaction, { embeds: [createSuccessEmbed(`${settingName}を更新しました！`, '設定更新')], flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
      try {
        const latestSettings = await getGuildSettingsFromRedis(guildId);
        const isAdmin = await isAdminUser(interaction);
        await showSettingsUI(interaction, latestSettings, isAdmin);
      } catch (error) {
        console.error('Settings UI update error:', error);
      }
    }, 1000);
  } catch (error) {
    console.error('Guild setting update error:', error);
    await safeReply(interaction, { content: '❌ 設定の更新に失敗しました。', flags: MessageFlags.Ephemeral });
  }
}

async function finalizeSettingsHandler(interaction) {
  try {
    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guildId;
    const result = await finalizeGuildSettings(guildId);

    let message = '✅ 設定の保存が完了しました。設定が有効化されました。';
    if (result && typeof result.message === 'string') message = `✅ ${result.message}`;

    await safeReply(interaction, { content: message, flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Finalize settings error:', error);
    let errorMessage = '❌ 設定の保存に失敗しました。';
  const status = error?.status;
    if (status === 404 || (error.message && error.message.includes('404'))) {
      errorMessage += '\nセッションが見つかりません。設定を再度お試しください。';
    } else if ((typeof status === 'number' && status >= 500) || (error.message && error.message.includes('500'))) {
      errorMessage += '\nバックエンドで一時的なエラーが発生しました。数分後にもう一度お試しください。';
      errorMessage += '\nローカルキャッシュ（Redis）には反映済みのため、復旧後に再保存されます。';
    } else if (error.message && error.message.includes('fetch')) {
      errorMessage += '\nネットワーク接続に問題があります。接続を確認してください。';
    }
    errorMessage += `\n詳細: ${error.message}`;
    await safeReply(interaction, { content: errorMessage, flags: MessageFlags.Ephemeral });

    // Background single retry for transient 5xx
    try {
      if (typeof status === 'number' && status >= 500) {
        setTimeout(async () => {
          try {
            const retryResult = await finalizeGuildSettings(interaction.guildId);
            console.log('[finalizeSettings] background retry result:', retryResult);
          } catch (e) {
            console.warn('[finalizeSettings] background retry failed:', e?.status || '', e?.message || e);
          }
        }, 30_000);
      }
    } catch (_) { /* no-op */ }
  }
}

async function resetAllSettings(interaction) {
  try {
    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.guildId;
    await saveGuildSettingsToRedis(guildId, {
      recruit_channel: null,
      notification_role: null,
      notification_roles: [],
      defaultTitle: null,
      defaultColor: null,
      update_channel: null,
      recruit_style: 'image',
      recruit_channels: [],
      enable_dedicated_channel: false,
      dedicated_channel_category_id: null,
    });
    await safeReply(interaction, { content: '✅ すべての設定をリセットしました！', flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
      try {
        const resetSettings = await getGuildSettingsFromRedis(guildId);
        const isAdmin = await isAdminUser(interaction);
        await showSettingsUI(interaction, resetSettings, isAdmin);
      } catch (error) {
        console.error('Settings UI update error:', error);
      }
    }, 1000);
  } catch (error) {
    console.error('Reset settings error:', error);
    await safeReply(interaction, { content: '❌ 設定のリセットに失敗しました。', flags: MessageFlags.Ephemeral });
  }
}

async function toggleRecruitStyle(interaction) {
  try {
    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.guildId;
    const currentSettings = await getGuildSettingsFromRedis(guildId);
    const next = (currentSettings?.recruit_style === 'simple') ? 'image' : 'simple';
    await saveGuildSettingsToRedis(guildId, { recruit_style: next });
    await safeReply(interaction, { content: `✅ 募集スタイルを「${next === 'simple' ? 'シンプル' : '画像パネル'}」に切り替えました！`, flags: MessageFlags.Ephemeral });
    setTimeout(async () => {
      try {
        const latest = await getGuildSettingsFromRedis(guildId);
        const isAdmin = await isAdminUser(interaction);
        await showSettingsUI(interaction, latest, isAdmin);
      } catch (e) {
        console.error('Settings UI update error:', e);
      }
    }, 500);
  } catch (error) {
    console.error('Toggle recruit style error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ 募集スタイルの切り替えに失敗しました。', flags: MessageFlags.Ephemeral });
    }
  }
}

async function toggleDedicatedChannel(interaction) {
  try {
    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.guildId;
    const currentSettings = await getGuildSettingsFromRedis(guildId);
    const next = !currentSettings?.enable_dedicated_channel;
    await saveGuildSettingsToRedis(guildId, { enable_dedicated_channel: next });
    await safeReply(interaction, { content: `✅ 専用チャンネル作成ボタンを「${next ? 'オン' : 'オフ'}」にしました。`, flags: MessageFlags.Ephemeral });
    setTimeout(async () => {
      try {
        const latest = await getGuildSettingsFromRedis(guildId);
        const isAdmin = await isAdminUser(interaction);
        await showSettingsUI(interaction, latest, isAdmin);
      } catch (e) {
        console.error('Settings UI update error:', e);
      }
    }, 500);
  } catch (error) {
    console.error('Toggle dedicated channel error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ 専用チャンネル設定の切り替えに失敗しました。', flags: MessageFlags.Ephemeral });
    }
  }
}

async function toggleSpecialMention(interaction, mentionType) {
  try {
    const isAdmin = await isAdminUser(interaction);
    if (!isAdmin) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guildId;
    const currentSettings = await getGuildSettingsFromRedis(guildId);
    
    // 現在の通知ロールリストを取得
    const notificationRoles = Array.isArray(currentSettings.notification_roles)
      ? [...currentSettings.notification_roles.filter(Boolean).map(String)]
      : [];

    // トグル処理
    const index = notificationRoles.indexOf(mentionType);
    if (index > -1) {
      // 既に含まれている場合は削除
      notificationRoles.splice(index, 1);
    } else {
      // 含まれていない場合は追加
      notificationRoles.push(mentionType);
    }

    // 設定を更新
    await saveGuildSettingsToRedis(guildId, {
      notification_roles: notificationRoles,
      notification_role: notificationRoles.length > 0 ? notificationRoles[0] : null,
    });

    // ロール選択UIを再表示
    await showRoleSelect(interaction, 'notification_roles', '🔔 通知ロールを選択してください');

  } catch (error) {
    console.error('Toggle special mention error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ 設定の更新に失敗しました。', flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = {
  execute,
  handleButtonInteraction,
  handleSelectMenuInteraction,
  handleModalSubmit,
  updateGuildSetting,
  finalizeSettingsHandler,
  resetAllSettings,
  toggleSpecialMention,
  toggleRecruitStyle,
};
