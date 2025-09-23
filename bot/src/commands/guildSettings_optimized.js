const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} = require('discord.js');

const { saveGuildSettings, getGuildSettings } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildsettings-opt')
    .setDescription('最適化されたギルドの募集設定を管理します')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      console.log(`[guildSettings-opt] 設定画面を表示 - ユーザー: ${interaction.user.username}, ギルド: ${interaction.guildId}`);
      
      // 現在の設定を取得
      const settings = await getGuildSettings(interaction.guildId);
      console.log(`[guildSettings-opt] 現在の設定:`, settings);
      
      await this.showSettingsUI(interaction, settings);
    } catch (error) {
      console.error('[guildSettings-opt] 実行エラー:', error);
      await interaction.reply({
        content: '❌ 設定画面の表示に失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async showSettingsUI(interaction, settings = {}) {
    // 現在の設定を表示するEmbed
    const settingsEmbed = new EmbedBuilder()
      .setTitle('⚙️ ギルド募集設定（最適化版）')
      .setDescription('各項目をクリックして設定を変更できます\n🚀 即座に保存される効率的なフローです')
      .setColor(0x5865F2)
      .addFields(
        {
          name: '📋 現在の設定',
          value: [
            `🏷️ **募集チャンネル**: ${settings.recruit_channel ? `<#${settings.recruit_channel}>` : '未設定'}`,
            `🔔 **通知ロール**: ${settings.notification_role ? `<@&${settings.notification_role}>` : '未設定'}`,
            `📝 **既定タイトル**: ${settings.defaultTitle || '未設定'}`,
            `🎨 **既定カラー**: ${settings.defaultColor || '未設定'}`,
            `📢 **アップデート通知**: ${settings.update_channel ? `<#${settings.update_channel}>` : '未設定'}`
          ].join('\n'),
          inline: false
        }
      )
      .setFooter({ text: '💡 設定変更は即座に反映されます' })
      .setTimestamp();

    // ボタン配置
    const actionRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('set_recruit_channel')
        .setLabel('📍 募集チャンネル設定')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('set_notification_role')
        .setLabel('🔔 通知ロール設定')
        .setStyle(ButtonStyle.Primary)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('set_default_title')
        .setLabel('📝 既定タイトル設定')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('set_default_color')
        .setLabel('🎨 既定カラー設定')
        .setStyle(ButtonStyle.Primary)
    );

    const actionRow3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('set_update_channel')
        .setLabel('📢 アップデート通知設定')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('reset_all_settings')
        .setLabel('🗑️ 全設定リセット')
        .setStyle(ButtonStyle.Danger)
    );

    const actionRow4 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('test_settings')
        .setLabel('🧪 設定テスト')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('close_settings')
        .setLabel('✅ 完了')
        .setStyle(ButtonStyle.Success)
    );

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          embeds: [settingsEmbed],
          components: [actionRow1, actionRow2, actionRow3, actionRow4]
        });
      } else {
        await interaction.reply({
          embeds: [settingsEmbed],
          components: [actionRow1, actionRow2, actionRow3, actionRow4],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('[guildSettings-opt] UI表示エラー:', error);
    }
  },

  async handleButtonInteraction(interaction) {
    const { customId } = interaction;

    try {
      switch (customId) {
        case 'set_recruit_channel':
          await this.showChannelSelect(interaction, 'recruit_channel', '📍 募集チャンネルを選択してください');
          break;
        case 'set_notification_role':
          await this.showRoleSelect(interaction, 'notification_role', '🔔 通知ロールを選択してください');
          break;
        case 'set_default_title':
          await this.showTitleModal(interaction);
          break;
        case 'set_default_color':
          await this.showColorModal(interaction);
          break;
        case 'set_update_channel':
          await this.showChannelSelect(interaction, 'update_channel', '📢 アップデート通知チャンネルを選択してください');
          break;
        case 'reset_all_settings':
          await this.resetAllSettings(interaction);
          break;
        case 'test_settings':
          await this.testSettings(interaction);
          break;
        case 'close_settings':
          await interaction.update({
            content: '✅ 設定完了！設定は自動保存されています。',
            embeds: [],
            components: []
          });
          break;
        default:
          console.log(`[guildSettings-opt] 未知のボタン: ${customId}`);
      }
    } catch (error) {
      console.error('[guildSettings-opt] ボタン処理エラー:', error);
      await interaction.reply({
        content: '❌ 設定処理中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async showChannelSelect(interaction, settingType, placeholder) {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`channel_select_${settingType}`)
      .setPlaceholder(placeholder)
      .addChannelTypes(ChannelType.GuildText);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    await interaction.update({
      content: placeholder,
      components: [row]
    });
  },

  async showRoleSelect(interaction, settingType, placeholder) {
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`role_select_${settingType}`)
      .setPlaceholder(placeholder);

    const row = new ActionRowBuilder().addComponents(roleSelect);

    await interaction.update({
      content: placeholder,
      components: [row]
    });
  },

  async showTitleModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('default_title_modal')
      .setTitle('📝 既定タイトル設定');

    const titleInput = new TextInputBuilder()
      .setCustomId('default_title_input')
      .setLabel('既定タイトル')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: スプラトゥーン3 参加者募集')
      .setRequired(true)
      .setMaxLength(100);

    const actionRow = new ActionRowBuilder().addComponents(titleInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  },

  async showColorModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('default_color_modal')
      .setTitle('🎨 既定カラー設定');

    const colorInput = new TextInputBuilder()
      .setCustomId('default_color_input')
      .setLabel('カラーコード（#を含む）')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: #FF69B4')
      .setRequired(true)
      .setMinLength(7)
      .setMaxLength(7);

    const actionRow = new ActionRowBuilder().addComponents(colorInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  },

  // 即座にSupabaseに保存する最適化されたメソッド
  async updateGuildSetting(interaction, settingKey, value) {
    try {
      const guildId = interaction.guildId;
      
      console.log(`[guildSettings-opt] updateGuildSetting - guildId: ${guildId}, settingKey: ${settingKey}, value: ${value}`);
      
      // 即座にSupabaseに保存
      const result = await saveGuildSettings(guildId, { [settingKey]: value });
      
      console.log(`[guildSettings-opt] 設定保存結果:`, result);
      
      // 設定名のマッピング
      const settingNames = {
        recruit_channel: '募集チャンネル',
        notification_role: '通知ロール',
        defaultTitle: '既定タイトル',
        defaultColor: '既定カラー',
        update_channel: 'アップデート通知チャンネル'
      };
      
      const settingName = settingNames[settingKey] || settingKey;
      
      await interaction.reply({
        content: `✅ ${settingName}を保存しました！\n🚀 即座にSupabaseに反映済み`,
        flags: MessageFlags.Ephemeral
      });

      // 設定画面を更新（最新データで）
      setTimeout(async () => {
        try {
          const updatedSettings = await getGuildSettings(guildId);
          await this.showSettingsUI(interaction, updatedSettings);
        } catch (error) {
          console.error('Settings UI update error:', error);
        }
      }, 1000);

    } catch (error) {
      console.error('[guildSettings-opt] 設定更新エラー:', error);
      await interaction.reply({
        content: '❌ 設定の保存に失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async resetAllSettings(interaction) {
    try {
      const guildId = interaction.guildId;
      
      // すべての設定をリセット（即座にSupabaseに保存）
      await saveGuildSettings(guildId, {
        recruit_channel: null,
        notification_role: null,
        defaultTitle: null,
        defaultColor: null,
        update_channel: null
      });
      
      console.log(`[guildSettings-opt] すべての設定をリセットしました - guildId: ${guildId}`);
      
      await interaction.reply({
        content: '✅ すべての設定をリセットしました！\n🚀 即座にSupabaseに反映済み',
        flags: MessageFlags.Ephemeral
      });

      // 設定画面を更新
      setTimeout(async () => {
        try {
          const updatedSettings = await getGuildSettings(guildId);
          await this.showSettingsUI(interaction, updatedSettings);
        } catch (error) {
          console.error('Settings UI update error:', error);
        }
      }, 1000);
    } catch (error) {
      console.error('[guildSettings-opt] リセットエラー:', error);
      await interaction.reply({
        content: '❌ 設定のリセットに失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async testSettings(interaction) {
    try {
      const guildId = interaction.guildId;
      const settings = await getGuildSettings(guildId);
      
      const testEmbed = new EmbedBuilder()
        .setTitle('🧪 設定テスト結果')
        .setColor(0x00FF00)
        .addFields(
          {
            name: '📊 取得したデータ',
            value: `\`\`\`json
${JSON.stringify(settings, null, 2)}
\`\`\``,
            inline: false
          },
          {
            name: '🔍 検証結果',
            value: [
              `✅ API接続: 正常`,
              `${settings.recruit_channel ? '✅' : '❌'} 募集チャンネル: ${settings.recruit_channel ? '設定済み' : '未設定'}`,
              `${settings.notification_role ? '✅' : '❌'} 通知ロール: ${settings.notification_role ? '設定済み' : '未設定'}`,
              `${settings.defaultTitle ? '✅' : '❌'} 既定タイトル: ${settings.defaultTitle ? '設定済み' : '未設定'}`,
              `${settings.defaultColor ? '✅' : '❌'} 既定カラー: ${settings.defaultColor ? '設定済み' : '未設定'}`
            ].join('\n'),
            inline: false
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [testEmbed],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('[guildSettings-opt] テストエラー:', error);
      await interaction.reply({
        content: '❌ 設定テストに失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async handleChannelSelect(interaction) {
    const channelId = interaction.values[0];
    const settingType = interaction.customId.replace('channel_select_', '');
    
    await this.updateGuildSetting(interaction, settingType, channelId);
  },

  async handleRoleSelect(interaction) {
    const roleId = interaction.values[0];
    const settingType = interaction.customId.replace('role_select_', '');
    
    await this.updateGuildSetting(interaction, settingType, roleId);
  },

  async handleModalSubmit(interaction) {
    const { customId } = interaction;
    
    if (customId === 'default_title_modal') {
      const title = interaction.fields.getTextInputValue('default_title_input');
      await this.updateGuildSetting(interaction, 'defaultTitle', title);
    } else if (customId === 'default_color_modal') {
      const color = interaction.fields.getTextInputValue('default_color_input');
      
      // カラーコードの検証
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        await interaction.reply({
          content: '❌ 無効なカラーコードです。#RRGGBB形式で入力してください。（例: #FF69B4）',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      await this.updateGuildSetting(interaction, 'defaultColor', color);
    }
  }
};