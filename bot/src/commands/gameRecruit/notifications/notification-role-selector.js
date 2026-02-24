/**
 * 通知ロール選択モジュール
 * ギルド設定に基づく通知ロール選択UI
 */

const { MessageFlags, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');
const { pendingModalOptions } = require('../data/state');
const { safeReply } = require('../../utils/safeReply');

/**
 * 設定済み通知ロールIDリストを構築
 */
function buildConfiguredNotificationRoleIds(guildSettings) {
  const roles = [];
  if (Array.isArray(guildSettings.notification_roles)) {
    roles.push(...guildSettings.notification_roles.filter(Boolean));
  }
  if (guildSettings.notification_role) {
    roles.push(guildSettings.notification_role);
  }
  return [...new Set(roles.map(String))].slice(0, 25);
}

/**
 * 有効な通知ロールをフェッチ（キャッシュ or API）
 */
async function fetchValidNotificationRoles(interaction, configuredIds) {
  const valid = [];
  for (const roleId of configuredIds) {
    let role = interaction.guild?.roles?.cache?.get(roleId) || null;
    if (!role) {
      role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    }
    if (role) {
      valid.push({ id: role.id, name: role.name });
    }
  }
  return valid;
}

/**
 * 通知ロールを選択（UIあり）
 * 事前選択（pending）がある場合はそれを使用、複数ある場合はセレクトメニューを表示
 */
async function selectNotificationRole(interaction, configuredIds) {
  // 事前選択（pending）
  try {
    const pending = interaction.user?.id ? pendingModalOptions.get(interaction.user.id) : null;
    const preSelected = pending?.notificationRoleId ? String(pending.notificationRoleId) : null;
    if (preSelected) {
      if (configuredIds.includes(preSelected)) {
        pendingModalOptions.delete(interaction.user.id);
        return { roleId: preSelected, aborted: false };
      }
      await safeReply(interaction, {
        content: '❌ 指定された通知ロールは使用できません（設定に含まれていません）。',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return { roleId: null, aborted: true };
    }
  } catch (e) {
    console.warn('pendingModalOptions (notificationRoleId) read failed:', e?.message || e);
  }

  const valid = await fetchValidNotificationRoles(interaction, configuredIds);
  if (valid.length === 0) return { roleId: null, aborted: false };
  if (valid.length === 1) return { roleId: valid[0].id, aborted: false };

  // 複数有効なロールがある場合、選択 UI を提示
  const options = valid.slice(0, 24).map(role =>
    new StringSelectMenuOptionBuilder()
      .setLabel(role.name?.slice(0, 100) || '通知ロール')
      .setValue(role.id)
  );
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('通知ロールなし')
      .setValue('none')
      .setDescription('今回は通知ロールを使用せずに募集します。')
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`recruit_notification_role_select_${interaction.id}`)
    .setPlaceholder('通知ロールを選択してください')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const promptMessage = await safeReply(interaction, {
    content: '🔔 通知ロールを選択してください（任意）',
    components: [selectRow],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { roles: [], users: [] }
  });

  if (!promptMessage?.awaitMessageComponent) {
    return { roleId: valid[0]?.id || null, aborted: false };
  }

  try {
    const selectInteraction = await promptMessage.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id
    });

    const choice = selectInteraction.values[0];
    const selected = choice === 'none' ? null : choice;
    const confirmationText = selected
      ? `🔔 通知ロール: <@&${selected}>`
      : '🔕 通知ロールを使用せずに募集を作成します。';

    await selectInteraction.update({
      content: confirmationText,
      components: [],
      allowedMentions: { roles: [], users: [] }
    });

    return { roleId: selected, aborted: false };
  } catch (collectorError) {
    console.warn('[selectNotificationRole] Selection timed out:', collectorError?.message || collectorError);
    await promptMessage.edit({
      content: '⏱ 通知ロールの選択がタイムアウトしました。募集は作成されませんでした。',
      components: []
    }).catch(() => {});
    return { roleId: null, aborted: true };
  }
}

module.exports = {
  buildConfiguredNotificationRoleIds,
  fetchValidNotificationRoles,
  selectNotificationRole
};
