module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      console.log(`[interaction] received: type=${interaction.type}${interaction.isChatInputCommand() ? ` command=${interaction.commandName}` : ''}${interaction.isButton() ? ` button=${interaction.customId}` : ''}${interaction.isStringSelectMenu() ? ` select=${interaction.customId}` : ''}`);
    } catch (_) {}

    // デデュープ: すでに処理済みのインタラクションIDなら無視
    if (client.processedInteractions.has(interaction.id)) {
      return;
    }
    client.processedInteractions.add(interaction.id);
    setTimeout(() => client.processedInteractions.delete(interaction.id), client.DEDUPE_TTL_MS);

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

    // セレクトメニューの処理（最適化版対応）
    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
      try {
        // 最適化されたguildSettingsの処理
        if (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_')) {
          const guildSettingsOpt = client.commands.get('guildsettings-opt');
          if (guildSettingsOpt) {
            if (interaction.customId.startsWith('channel_select_')) {
              await guildSettingsOpt.handleChannelSelect(interaction);
            } else if (interaction.customId.startsWith('role_select_')) {
              await guildSettingsOpt.handleRoleSelect(interaction);
            }
            return;
          }
        }
        
        // 元々のguildSettingsのメニュー処理
        if (interaction.customId.includes('_select_')) {
          const guildSettings = client.commands.get('guildsettings');
          if (guildSettings && guildSettings.handleSelectMenu) {
            await guildSettings.handleSelectMenu(interaction);
          }
          return;
        }
      } catch (error) {
        console.error('Select menu handling error:', error);
        await safeRespond({ 
          content: '選択処理中にエラーが発生しました。', 
          flags: require('discord.js').MessageFlags.Ephemeral 
        }).catch(console.error);
      }
    }

    // セレクトメニューの処理（元のコード）
    if (interaction.isStringSelectMenu()) {
      // ギルド設定のセレクトメニュー
      if (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_')) {
        const guildSettings = client.commands.get('guildsettings');
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          try {
            await guildSettings.handleSelectMenuInteraction(interaction);
          } catch (error) {
            console.error('ギルド設定セレクトメニュー処理中にエラー:', error);
            console.error('エラーの詳細:', error.stack);
            await safeRespond({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
          }
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
        const guildSettings = client.commands.get('guildsettings');
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          try {
            await guildSettings.handleSelectMenuInteraction(interaction);
          } catch (error) {
            console.error('ギルド設定セレクトメニュー処理中にエラー:', error);
            console.error('エラーの詳細:', error.stack);
            await safeRespond({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
          }
        }
      }
      return;
    }

    // モーダル送信(type=5)の処理
    if ((interaction.isModalSubmit && interaction.isModalSubmit()) || interaction.type === 5) {
      // 最適化されたギルド設定のモーダル処理
      if (interaction.customId === 'default_title_modal' || interaction.customId === 'default_color_modal') {
        const guildSettingsOpt = client.commands.get('guildsettings-opt');
        if (guildSettingsOpt && typeof guildSettingsOpt.handleModalSubmit === 'function') {
          try {
            await guildSettingsOpt.handleModalSubmit(interaction);
            return; // 最適化版で処理済み
          } catch (error) {
            console.error('最適化ギルド設定モーダル処理中にエラー:', error);
            // フォールバックで元の処理を試行
          }
        }
        
        // フォールバック：元のギルド設定処理
        const guildSettings = client.commands.get('guildsettings');
        if (guildSettings && typeof guildSettings.handleModalSubmit === 'function') {
          try {
            await guildSettings.handleModalSubmit(interaction);
          } catch (error) {
            console.error('ギルド設定モーダル処理中にエラー:', error);
            if (error && error.stack) console.error(error.stack);
            await safeRespond({ content: `モーダル処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
          }
        }
        return;
      }

      // editRecruitコマンドのモーダル処理
      if (interaction.customId.startsWith('editRecruitModal_')) {
        const editRecruit = client.commands.get('editrecruit');
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
      const gameRecruit = client.commands.get('gamerecruit');
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
      // 最適化されたギルド設定のボタン処理
      if (interaction.customId.startsWith('set_') || interaction.customId === 'reset_all_settings' || 
          interaction.customId === 'test_settings' || interaction.customId === 'close_settings') {
        
        const guildSettingsOpt = client.commands.get('guildsettings-opt');
        if (guildSettingsOpt && typeof guildSettingsOpt.handleButtonInteraction === 'function') {
          try {
            await guildSettingsOpt.handleButtonInteraction(interaction);
            return; // 最適化版で処理済み
          } catch (error) {
            console.error('最適化ギルド設定ボタン処理中にエラー:', error);
            // フォールバックで元の処理を試行
          }
        }
      }
      
      // 元のギルド設定のボタン処理（フォールバック）
      if (interaction.customId.startsWith('set_') || interaction.customId === 'reset_all_settings' || interaction.customId === 'finalize_settings') {
        const guildSettings = client.commands.get('guildsettings');
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
      const gameRecruit = client.commands.get('gamerecruit');
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

