// --- interactionCreate event handler ---
// Cleans up previous merge artifacts and provides a single authoritative implementation.
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

    // スラッシュコマンドの処理
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
      try {
        console.log(`[interactionCreate] about to call execute for command=${interaction.commandName}, executeType=${typeof command.execute}`);
        await command.execute(interaction);
        console.log(`[interactionCreate] execute returned for command=${interaction.commandName}`);
      } catch (error) {
        console.error(error);
        await safeRespond({ content: 'コマンド実行中にエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch((e) => {
          console.error('Failed to send error response:', e);
        });
      }
      return;
    }

    // セレクトメニューの処理 (string select)
    if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
      // ギルド設定のセレクトメニュー
      if (interaction.customId && (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_'))) {
        const guildSettings = getGuildSettingsCommand();
        console.log(`[interactionCreate] routing to guildSettings (select) - found=${Boolean(guildSettings)}`);
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          try {
            await guildSettings.handleSelectMenuInteraction(interaction);
          } catch (error) {
            console.error('ギルド設定セレクトメニュー処理中にエラー:', error);
            await safeRespond({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for select menu. Available commands:', [...client.commands.keys()].join(', '));
          await safeRespond({ content: '設定ハンドラが見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }

      // ヘルプコマンドのセレクトメニュー
      if (interaction.customId === 'help_command_select') {
        const helpCommand = client.commands.get('help');
        if (helpCommand && typeof helpCommand.handleSelectMenu === 'function') {
          try {
            await helpCommand.handleSelectMenu(interaction);
          } catch (error) {
            console.error('ヘルプセレクトメニュー処理中にエラー:', error);
            await safeRespond({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
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

    // ボタンインタラクションの処理
    if (interaction.isButton && interaction.isButton()) {
      // ロール付与ボタン (例)
      if (interaction.customId === 'grant_role_1420235531442196562') {
        const roleId = '1420235531442196562';
        const member = interaction.guild?.members?.cache?.get(interaction.user.id);
        if (!member) {
          await safeRespond({ content: 'メンバー情報が取得できませんでした。', flags: require('discord.js').MessageFlags.Ephemeral });
          return;
        }
        if (member.roles.cache.has(roleId)) {
          await safeRespond({ content: 'すでにロールが付与されています。', flags: require('discord.js').MessageFlags.Ephemeral });
          return;
        }
        try {
          await member.roles.add(roleId, 'ロール付与ボタンによる自動付与');
          await safeRespond({ content: 'ロールを付与しました！', flags: require('discord.js').MessageFlags.Ephemeral });
        } catch (e) {
          console.error('ロール付与エラー:', e);
          await safeRespond({ content: 'ロール付与に失敗しました。権限やロール位置を確認してください。', flags: require('discord.js').MessageFlags.Ephemeral });
        }
        return;
      }

      // ロール剥奪ボタン (例)
      if (interaction.customId === 'remove_role_1420235531442196562') {
        const roleId = '1420235531442196562';
        const member = interaction.guild?.members?.cache?.get(interaction.user.id);
        if (!member) {
          await safeRespond({ content: 'メンバー情報が取得できませんでした。', flags: require('discord.js').MessageFlags.Ephemeral });
          return;
        }
        if (!member.roles.cache.has(roleId)) {
          await safeRespond({ content: 'ロールが付与されていません。', flags: require('discord.js').MessageFlags.Ephemeral });
          return;
        }
        try {
          await member.roles.remove(roleId, 'ロール剥奪ボタンによる自動剥奪');
          await safeRespond({ content: 'ロールを外しました。', flags: require('discord.js').MessageFlags.Ephemeral });
        } catch (e) {
          console.error('ロール剥奪エラー:', e);
          await safeRespond({ content: 'ロールの剥奪に失敗しました。権限やロール位置を確認してください。', flags: require('discord.js').MessageFlags.Ephemeral });
        }
        return;
      }

      // サポートサーバー: 1回限りの「ボット招待」URL発行ボタン
      if (interaction.customId === 'one_time_support_invite') {
        try {
          const SUPPORT_CHANNEL_ID = '1434493999363653692';
          // 指定チャンネル以外では無視
          if (!interaction.channel || interaction.channel.id !== SUPPORT_CHANNEL_ID) {
            await safeRespond({ content: 'このボタンは指定のサポートチャンネルでのみ使用できます。', flags: require('discord.js').MessageFlags.Ephemeral });
            return;
          }
          // バックエンドにワンタイムの「ボット招待ラッパーURL」をリクエスト
          const backendFetch = require('../utils/backendFetch');
          let url = null;
          try {
            const res = await backendFetch('/api/bot-invite/one-time', { method: 'POST' });
            url = res && res.url ? res.url : null;
          } catch (e) {
            console.error('[support invite] backend one-time link error:', e);
          }
          if (!url) {
            await safeRespond({ content: '招待URLの発行に失敗しました。Botのバックエンド設定(DISCORD_CLIENT_ID等)を確認してください。', flags: require('discord.js').MessageFlags.Ephemeral });
            return;
          }
          await safeRespond({
            content: `🤖 一回限りの「ボット招待」URLを発行しました。\nこのリンクは初回アクセス時のみ有効です。\n\n${url}`,
            flags: require('discord.js').MessageFlags.Ephemeral
          });
        } catch (e) {
          console.error('[support invite] error:', e);
          await safeRespond({ content: '招待URLの発行に失敗しました。Botに招待作成の権限があるか確認してください。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }

      // ギルド設定のボタン処理
      if (interaction.customId && (interaction.customId.startsWith('set_') || interaction.customId === 'reset_all_settings' || interaction.customId === 'finalize_settings')) {
        const guildSettings = getGuildSettingsCommand();
        console.log(`[interactionCreate] routing to guildSettings (button) - customId=${interaction.customId}, found=${Boolean(guildSettings)}`);
        if (guildSettings) {
          try {
            if (interaction.customId === 'finalize_settings' && typeof guildSettings.finalizeSettings === 'function') {
              await guildSettings.finalizeSettings(interaction);
            } else if (typeof guildSettings.handleButtonInteraction === 'function') {
              await guildSettings.handleButtonInteraction(interaction);
            }
          } catch (error) {
            console.error('ギルド設定ボタン処理中にエラー:', error);
            await safeRespond({ content: 'ボタン処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for button. Available commands:', [...client.commands.keys()].join(', '));
          await safeRespond({ content: '設定ハンドラが見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }

      // ウェルカムメッセージのヘルプボタン処理
      if (interaction.customId === 'welcome_help') {
        const helpCommand = client.commands.get('help');
        if (helpCommand) {
          try {
            await helpCommand.execute(interaction);
          } catch (error) {
            console.error('ウェルカムヘルプボタン処理中にエラー:', error);
            await safeRespond({ content: 'ヘルプ表示でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        }
        return;
      }

      // helpコマンドのボタン処理
      if (interaction.customId === 'help_back') {
        const helpCommand = client.commands.get('help');
        if (helpCommand && typeof helpCommand.handleButton === 'function') {
          try {
            await helpCommand.handleButton(interaction);
          } catch (error) {
            console.error('ヘルプボタン処理中にエラー:', error);
            await safeRespond({ content: 'ボタン処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        }
        return;
      }

      // gameRecruitコマンドのボタンのみ処理（参加者管理・UI更新はgameRecruit.jsに一元化）
      const gameRecruit = client.commands.get('rect');
      if (gameRecruit && typeof gameRecruit.handleButton === 'function') {
        try {
          await gameRecruit.handleButton(interaction);
        } catch (error) {
          console.error('ボタン処理中にエラー:', error);
          await safeRespond({ content: `ボタン処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
      }
      return;
    }
  },
};

