// --- interactionCreate event handler ---
// P0修正: 共通エラーハンドラーを使用し、deferReplyを標準化
const { MessageFlags } = require('discord.js');
const { safeRespond, handleCommandSafely, handleComponentSafely } = require('../utils/interactionHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      console.log(
        `[interaction] received: type=${interaction.type}` +
          `${interaction.isChatInputCommand && interaction.isChatInputCommand() ? ` command=${interaction.commandName}` : ''}` +
          `${interaction.isButton && interaction.isButton() ? ` button=${interaction.customId}` : ''}` +
          `${interaction.isStringSelectMenu && interaction.isStringSelectMenu() ? ` select=${interaction.customId}` : ''}`
      );
    } catch (_) {}

    // デデュープ: すでに処理済みのインタラクションIDなら無視
    try {
      const hasSet = client && client.processedInteractions && typeof client.processedInteractions.has === 'function' && client.processedInteractions.has(interaction.id);
      if (hasSet) {
        console.log(`[interactionCreate] Skipping already-processed interaction id=${interaction.id}`);
        return;
      }
      if (client && client.processedInteractions && typeof client.processedInteractions.add === 'function') {
        client.processedInteractions.add(interaction.id);
        setTimeout(() => {
          try {
            client.processedInteractions.delete(interaction.id);
          } catch (e) {
            console.warn('[interactionCreate] Failed to remove interaction id from processedInteractions', e?.message || e);
          }
        }, client.DEDUPE_TTL_MS || 3000);
      }
    } catch (e) {
      console.error('[interactionCreate] Error during dedupe check:', e);
    }

    // 二重応答(40060)を避けるための安全な返信関数
    const safeRespond = async (payload) => {
      try {
        if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
        return await interaction.reply(payload);
      } catch (e) {
        if (e && (e.code === 40060 || e.status === 400)) {
          try {
            return await interaction.followUp(payload);
          } catch (_) {}
        }
        throw e;
      }
    };

    // ギルド設定コマンド解決ヘルパー（setting が優先）
    const getGuildSettingsCommand = () => client.commands.get('setting') || client.commands.get('rect-setting');

    // P0修正: スラッシュコマンドの処理を統一ハンドラーでラップ
    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        try {
          console.warn(`[interactionCreate] Command handler not found for '${interaction.commandName}'. Available commands: ${[...client.commands.keys()].join(', ')}`);
        } catch (e) {
          console.warn('[interactionCreate] Command handler not found and failed to list available commands');
        }
        return;
      }
      
      // 統一エラーハンドリング: deferReply + try/catch + 安全な返信
      await handleCommandSafely(interaction, async (inter) => {
        console.log(`[interactionCreate] about to call execute for command=${interaction.commandName}, executeType=${typeof command.execute}`);
        await command.execute(inter);
        console.log(`[interactionCreate] execute returned for command=${interaction.commandName}`);
      });
      return;
    }

    // P0修正: セレクトメニューの処理を統一ハンドラーでラップ
    if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
      // ギルド設定のセレクトメニュー
      if (interaction.customId && (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_'))) {
        const guildSettings = getGuildSettingsCommand();
        console.log(`[interactionCreate] routing to guildSettings (select) - found=${Boolean(guildSettings)}`);
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          await handleComponentSafely(interaction, () => guildSettings.handleSelectMenuInteraction(interaction));
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for select menu. Available commands:', [...client.commands.keys()].join(', '));
          await safeRespond(interaction, { content: '設定ハンドラが見つかりませんでした。', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }

      // ヘルプコマンドのセレクトメニュー
      if (interaction.customId === 'help_command_select') {
        const helpCommand = client.commands.get('help');
        if (helpCommand && typeof helpCommand.handleSelectMenu === 'function') {
          await handleComponentSafely(interaction, () => helpCommand.handleSelectMenu(interaction));
        }
      }
      return;
    }

    // ロールセレクト/チャンネルセレクトの処理 (role/channel select)
    if ((interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) || (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu())) {
      console.log(`[interactionCreate] Role/Channel select menu - customId: ${interaction.customId}, type: ${interaction.type}`);
      if (interaction.customId && (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_'))) {
        const guildSettings = getGuildSettingsCommand();
        console.log(`[interactionCreate] routing to guildSettings (role/channel select) - found=${Boolean(guildSettings)}`);
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          try {
            await guildSettings.handleSelectMenuInteraction(interaction);
          } catch (error) {
            console.error('ギルド設定セレクトメニュー処理中にエラー:', error);
            await safeRespond({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for role/channel select. Available commands:', [...client.commands.keys()].join(', '));
          await safeRespond({ content: '設定ハンドラが見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
      }
      return;
    }

    // モーダル送信(type=5)の処理
    if ((interaction.isModalSubmit && interaction.isModalSubmit()) || interaction.type === 5) {
      // ギルド設定のモーダル処理
      if (interaction.customId === 'default_title_modal' || interaction.customId === 'default_color_modal') {
        const guildSettings = getGuildSettingsCommand();
        console.log(`[interactionCreate] routing to guildSettings (modal) - found=${Boolean(guildSettings)}`);
        if (guildSettings && typeof guildSettings.handleModalSubmit === 'function') {
          try {
            await guildSettings.handleModalSubmit(interaction);
          } catch (error) {
            console.error('ギルド設定モーダル処理中にエラー:', error);
            await safeRespond({ content: `モーダル処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for modal. Available commands:', [...client.commands.keys()].join(', '));
          await safeRespond({ content: '設定ハンドラが見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }

      // editRecruitコマンドのモーダル処理
      if (interaction.customId && interaction.customId.startsWith('editRecruitModal_')) {
        const editRecruit = client.commands.get('rect-edit');
        if (editRecruit && typeof editRecruit.handleEditModalSubmit === 'function') {
          try {
            await editRecruit.handleEditModalSubmit(interaction);
          } catch (error) {
            console.error('編集モーダル送信処理中にエラー:', error);
            await safeRespond({ content: `編集モーダル送信処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        }
        return;
      }

      // gameRecruitコマンドのモーダルのみ処理
      const gameRecruit = client.commands.get('rect');
      if (gameRecruit && typeof gameRecruit.handleModalSubmit === 'function') {
        try {
          await gameRecruit.handleModalSubmit(interaction);
        } catch (error) {
          console.error('モーダル送信処理中にエラー:', error);
          await safeRespond({ content: `モーダル送信処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
      }
      return;
    }

    // P0修正: ボタンインタラクションの処理を統一ハンドラーでラップ
    if (interaction.isButton && interaction.isButton()) {
      // gameRecruitコマンドのボタンのみ処理（参加者管理・UI更新はgameRecruit.jsに一元化）
      const gameRecruit = client.commands.get('rect');
      if (gameRecruit && typeof gameRecruit.handleButton === 'function') {
        await handleComponentSafely(interaction, () => gameRecruit.handleButton(interaction));
      }
      return;
    }
  },
};

