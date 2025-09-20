module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // スラッシュコマンドの処理
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied) {
          await interaction.reply({ content: 'コマンド実行中にエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral });
        }
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
            if (!interaction.replied) {
              await interaction.reply({ content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral });
            }
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
          if (!interaction.replied) {
            await interaction.reply({ content: `モーダル送信処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral });
          }
        }
      }
      return;
    }

    // ボタンインタラクションの処理
    if (interaction.isButton()) {
      // helpコマンドのボタン処理
      if (interaction.customId === 'help_back') {
        const helpCommand = client.commands.get('help');
        if (helpCommand && typeof helpCommand.handleButton === 'function') {
          try {
            await helpCommand.handleButton(interaction);
          } catch (error) {
            console.error('ヘルプボタン処理中にエラー:', error);
            if (!interaction.replied) {
              await interaction.reply({ content: 'ボタン処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral });
            }
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
          if (!interaction.replied) {
            await interaction.reply({ content: `ボタン処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral });
          }
        }
      }
      return;
    }
  },
};

