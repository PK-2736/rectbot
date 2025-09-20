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

    // セレクトメニューの処理
    if (interaction.isStringSelectMenu()) {
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

    // モーダル送信(type=5)の処理
    if ((interaction.isModalSubmit && interaction.isModalSubmit()) || interaction.type === 5) {
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

