// --- ロール付与・剥奪ボタンの処理は下記async execute内に移動 ---
module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      console.log(`[interaction] received: type=${interaction.type}${interaction.isChatInputCommand() ? ` command=${interaction.commandName}` : ''}${interaction.isButton() ? ` button=${interaction.customId}` : ''}${interaction.isStringSelectMenu() ? ` select=${interaction.customId}` : ''}`);
    } catch (_) {}

    // デデュープ: すでに処理済みのインタラクションIDなら無視
    try {
      const hasSet = client && client.processedInteractions && client.processedInteractions.has && client.processedInteractions.has(interaction.id);
      console.log(`[interactionCreate] dedupe check - interaction.id=${interaction.id}, alreadyProcessed=${hasSet}`);
      if (hasSet) {
        console.log(`[interactionCreate] Skipping already-processed interaction id=${interaction.id}`);
        return;
      }
      if (client && client.processedInteractions && typeof client.processedInteractions.add === 'function') {
        client.processedInteractions.add(interaction.id);
        console.log(`[interactionCreate] Added interaction.id to processedInteractions: ${interaction.id}`);
        setTimeout(() => {
          try {
            client.processedInteractions.delete(interaction.id);
            console.log(`[interactionCreate] Removed interaction.id from processedInteractions: ${interaction.id}`);
          } catch (e) {
            console.warn('[interactionCreate] Failed to remove interaction id from processedInteractions', e?.message || e);
          }
        }, client.DEDUPE_TTL_MS);
      } else {
        console.warn('[interactionCreate] processedInteractions set not available on client');
      }
    } catch (e) {
      console.error('[interactionCreate] Error during dedupe check:', e);
    }

    // 二重応答(40060)を避けるための安全な返信関数
    const safeRespond = async (payload) => {
      try {
        if (interaction.deferred || interaction.replied) {
          return await interaction.followUp(payload);
        }
        return await interaction.reply(payload);
      } catch (e) {
        // 既に応答済み (40060) か、初回 reply が失敗した場合は followUp を試す
        if (e && (e.code === 40060 || e.status === 400)) {
          try {
            return await interaction.followUp(payload);
          } catch (_) {
            // それでも失敗したら黙って無視（ログは上位で出す）
          }
        }
        throw e;
      }
    };
  // ギルド設定コマンド解決ヘルパー（setting が優先）
  const getGuildSettingsCommand = () => client.commands.get('setting') || client.commands.get('rect-setting');
    // スラッシュコマンドの処理
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        await safeRespond({ content: 'コマンド実行中にエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch((e)=>{
          console.error('Failed to send error response:', e);
        });
      }
      return;
    }

    // セレクトメニューの処理
    if (interaction.isStringSelectMenu()) {
      // ギルド設定のセレクトメニュー
      if (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_')) {
<<<<<<< HEAD
<<<<<<< HEAD
        const guildSettings = client.commands.get('setting');
        console.log(`[interactionCreate] routing to guildSettings (select) - found=${Boolean(guildSettings)}`);
=======
        const getGuildSettingsCommand = () => client.commands.get('rect-setting') || client.commands.get('setting');
=======
>>>>>>> c0608dc0 (t@)
        const guildSettings = getGuildSettingsCommand();
>>>>>>> c67dbc42 (Checkpoint from VS Code for coding agent session)
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          try {
            await guildSettings.handleSelectMenuInteraction(interaction);
          } catch (error) {
            console.error('ギルド設定セレクトメニュー処理中にエラー:', error);
            console.error('エラーの詳細:', error.stack);
            await safeRespond({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
          }
        }
        else {
          console.warn('[interactionCreate] guildSettings handler not found for select menu. Available commands:', [...client.commands.keys()].join(', '));
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
            console.error('エラーの詳細:', error.stack);
            await safeRespond({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
          }
        }
      }
      return;
    }

    // ロールセレクトメニューとチャンネルセレクトメニューの処理
    if (interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
      console.log(`[interactionCreate] Role/Channel select menu - customId: ${interaction.customId}, type: ${interaction.type}`);
      
      // ギルド設定のセレクトメニュー
      if (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_')) {
<<<<<<< HEAD
<<<<<<< HEAD
        const guildSettings = client.commands.get('setting');
=======
        const getGuildSettingsCommand = () => client.commands.get('rect-setting') || client.commands.get('setting');
=======
>>>>>>> c0608dc0 (t@)
        const guildSettings = getGuildSettingsCommand();
>>>>>>> c67dbc42 (Checkpoint from VS Code for coding agent session)
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          try {
            await guildSettings.handleSelectMenuInteraction(interaction);
          } catch (error) {
            console.error('ギルド設定セレクトメニュー処理中にエラー:', error);
            console.error('エラーの詳細:', error.stack);
            await safeRespond({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
          }
        }
        else {
          console.warn('[interactionCreate] guildSettings handler not found for role/channel select. Available commands:', [...client.commands.keys()].join(', '));
        }
      }
      return;
    }

    // モーダル送信(type=5)の処理
    if ((interaction.isModalSubmit && interaction.isModalSubmit()) || interaction.type === 5) {
      // ギルド設定のモーダル処理
      if (interaction.customId === 'default_title_modal' || interaction.customId === 'default_color_modal') {
<<<<<<< HEAD
<<<<<<< HEAD
        const guildSettings = client.commands.get('setting');
        console.log(`[interactionCreate] routing to guildSettings (modal) - found=${Boolean(guildSettings)}`);
=======
        const getGuildSettingsCommand = () => client.commands.get('rect-setting') || client.commands.get('setting');
=======
>>>>>>> c0608dc0 (t@)
        const guildSettings = getGuildSettingsCommand();
>>>>>>> c67dbc42 (Checkpoint from VS Code for coding agent session)
        if (guildSettings && typeof guildSettings.handleModalSubmit === 'function') {
          try {
            await guildSettings.handleModalSubmit(interaction);
          } catch (error) {
            console.error('ギルド設定モーダル処理中にエラー:', error);
            if (error && error.stack) console.error(error.stack);
            await safeRespond({ content: `モーダル処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
          }
        }
        else {
          console.warn('[interactionCreate] guildSettings handler not found for modal. Available commands:', [...client.commands.keys()].join(', '));
        }
        return;
      }

      // editRecruitコマンドのモーダル処理
      if (interaction.customId.startsWith('editRecruitModal_')) {
  const editRecruit = client.commands.get('rect-edit');
  if (editRecruit && typeof editRecruit.handleEditModalSubmit === 'function') {
          try {
            await editRecruit.handleEditModalSubmit(interaction);
          } catch (error) {
            console.error('編集モーダル送信処理中にエラー:', error);
            if (error && error.stack) console.error(error.stack);
            await safeRespond({ content: `編集モーダル送信処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
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
          if (error && error.stack) console.error(error.stack);
          await safeRespond({ content: `モーダル送信処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
        }
      }
      return;
    }

    // ボタンインタラクションの処理
    if (interaction.isButton()) {
      // ロール付与ボタン
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
      // ロール剥奪ボタン
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
      // ロール付与ボタン
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
      // ギルド設定のボタン処理
<<<<<<< HEAD
    if (interaction.customId.startsWith('set_') || interaction.customId === 'reset_all_settings' || interaction.customId === 'finalize_settings') {
  const guildSettings = client.commands.get('setting');
  console.log(`[interactionCreate] routing to guildSettings (button) - customId=${interaction.customId}, found=${Boolean(guildSettings)}`);
=======
      if (interaction.customId.startsWith('set_') || interaction.customId === 'reset_all_settings' || interaction.customId === 'finalize_settings') {
        const guildSettings = getGuildSettingsCommand();
>>>>>>> c67dbc42 (Checkpoint from VS Code for coding agent session)
        if (guildSettings) {
          try {
            if (interaction.customId === 'finalize_settings') {
              if (typeof guildSettings.finalizeSettings === 'function') {
                await guildSettings.finalizeSettings(interaction);
              }
            } else if (typeof guildSettings.handleButtonInteraction === 'function') {
              await guildSettings.handleButtonInteraction(interaction);
            }
          } catch (error) {
            console.error('ギルド設定ボタン処理中にエラー:', error);
            console.error('エラーの詳細:', error.stack);
            await safeRespond({ content: 'ボタン処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
          }
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for button. Available commands:', [...client.commands.keys()].join(', '));
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
            await safeRespond({ content: 'ヘルプ表示でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
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
            console.error('エラーの詳細:', error.stack);
            await safeRespond({ content: 'ボタン処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
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
          if (error && error.stack) console.error(error.stack);
          await safeRespond({ content: `ボタン処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
        }
      }
      return;
    }
  },
};

