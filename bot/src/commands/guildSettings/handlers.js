const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { saveGuildSettingsToRedis, getGuildSettingsFromRedis, getGuildSettingsSmart, finalizeGuildSettings } = require('../../utils/db');
const { safeReply } = require('../../utils/safeReply');
const {
  showSettingsUI,
  showChannelSelect,
  showRoleSelect,
  showTitleModal,
  showColorModal,
} = require('./ui');

async function execute(interaction) {
  try {
    const isAdmin = interaction.guild && interaction.member && interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
    const currentSettings = await getGuildSettingsSmart(interaction.guildId);
    await showSettingsUI(interaction, currentSettings, isAdmin);
  } catch (error) {
    console.error('Guild settings command error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ 設定画面の表示でエラーが発生しました。', flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleButtonInteraction(interaction) {
  const { customId } = interaction;
  try {
    if (!interaction.guild || !interaction.member || !interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    switch (customId) {
      case 'set_recruit_channel':
        await showChannelSelect(interaction, 'recruit_channel', '📍 募集チャンネルを選択してください');
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
      case 'set_update_channel':
        await showChannelSelect(interaction, 'update_channel', '📢 アップデート通知チャンネルを選択してください');
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
    }
  } catch (error) {
    console.error('Button interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ 処理中にエラーが発生しました。', flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleSelectMenuInteraction(interaction) {
  const { customId, values } = interaction;
  try {
    if (!interaction.guild || !interaction.member || !interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    if (customId.startsWith('channel_select_')) {
      const settingType = customId.replace('channel_select_', '');
      const channelId = values[0];
      await updateGuildSetting(interaction, settingType, channelId);
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
    if (!interaction.guild || !interaction.member || !interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    if (customId === 'default_title_modal') {
      const title = interaction.fields.getTextInputValue('default_title');
      await updateGuildSetting(interaction, 'defaultTitle', title);
    } else if (customId === 'default_color_modal') {
      const color = interaction.fields.getTextInputValue('default_color');
      if (color && !/^[0-9A-Fa-f]{6}$/.test(color)) {
        return await safeReply(interaction, { content: '❌ 無効なカラーコードです。6桁の16進数（例: 5865F2）を入力してください。', flags: MessageFlags.Ephemeral });
      }
      await updateGuildSetting(interaction, 'defaultColor', color);
    }
  } catch (error) {
    console.error('Modal submit error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { content: '❌ 設定の更新でエラーが発生しました。', flags: MessageFlags.Ephemeral });
    }
  }
}

async function updateGuildSetting(interaction, settingKey, value) {
  try {
    if (!interaction.guild || !interaction.member || !interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
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
    }

    const result = await saveGuildSettingsToRedis(guildId, payload);

    const settingNames = {
      recruit_channel: '募集チャンネル',
      notification_roles: '通知ロール',
      notification_role: '通知ロール',
      defaultTitle: '既定タイトル',
      defaultColor: '既定カラー',
      update_channel: 'アップデート通知チャンネル',
    };

    const settingName = settingNames[settingKey] || settingKey;
    await safeReply(interaction, { content: `✅ ${settingName}を更新しました！`, flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
      try {
        const latestSettings = await getGuildSettingsFromRedis(guildId);
        await showSettingsUI(interaction, latestSettings);
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
    if (!interaction.guild || !interaction.member || !interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
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
    if (!interaction.guild || !interaction.member || !interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
      return await safeReply(interaction, { content: '❌ この操作を実行するには「管理者」権限が必要です。', flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.guildId;
    const result = await saveGuildSettingsToRedis(guildId, {
      recruit_channel: null,
      notification_role: null,
      notification_roles: [],
      defaultTitle: null,
      defaultColor: null,
      update_channel: null,
    });
    await safeReply(interaction, { content: '✅ すべての設定をリセットしました！', flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
      try {
        const resetSettings = await getGuildSettingsFromRedis(guildId);
        await showSettingsUI(interaction, resetSettings);
      } catch (error) {
        console.error('Settings UI update error:', error);
      }
    }, 1000);
  } catch (error) {
    console.error('Reset settings error:', error);
    await safeReply(interaction, { content: '❌ 設定のリセットに失敗しました。', flags: MessageFlags.Ephemeral });
  }
}

async function toggleSpecialMention(interaction, mentionType) {
  try {
    if (!interaction.guild || !interaction.member || !interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
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
};
