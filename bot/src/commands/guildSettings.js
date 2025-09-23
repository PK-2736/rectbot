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
    .setName('guildsettings')
    .setDescription('ギルドの募集設定を管理します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      // 権限チェック
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return await interaction.reply({
          content: '❌ この機能を使用するには「サーバー管理」権限が必要です。',
          flags: MessageFlags.Ephemeral
        });
      }

      // 現在の設定を取得
      const currentSettings = await getGuildSettings(interaction.guildId);
      
      await this.showSettingsUI(interaction, currentSettings);

    } catch (error) {
      console.error('Guild settings command error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ 設定画面の表示でエラーが発生しました。',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  },

  async showSettingsUI(interaction, settings = {}) {
    // 現在の設定を表示するEmbed
    const settingsEmbed = new EmbedBuilder()
      .setTitle('⚙️ ギルド募集設定')
      .setDescription('各項目をクリックして設定を変更できます')
      .setColor(0x5865F2)
      .addFields(
        {
          name: '📋 現在の設定',
          value: [
            `🏷️ **募集チャンネル**: ${settings.recruit_channel ? `<#${settings.recruit_channel}>` : '未設定'}`,
            `🔔 **通知ロール**: ${settings.notification_role ? `<@&${settings.notification_role}>` : '未設定'}`,
            `📝 **既定タイトル**: ${settings.defaultTitle || '未設定'}`,
            `🎨 **既定カラー**: ${settings.defaultColor ? `#${settings.defaultColor}` : '未設定'}`,
            `📢 **アップデート通知チャンネル**: ${settings.update_channel ? `<#${settings.update_channel}>` : '未設定'}`
          ].join('\n'),
          inline: false
        },
        {
          name: '🔧 設定変更',
          value: '下のボタンから設定したい項目を選択してください。',
          inline: false
        }
      )
      .setTimestamp()
      .setFooter({ text: 'RectBot ギルド設定', iconURL: interaction.client.user.displayAvatarURL() });

    // 設定変更ボタン
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
        .setLabel('📢 アップデート通知チャンネル設定')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('reset_all_settings')
        .setLabel('🔄 すべてリセット')
        .setStyle(ButtonStyle.Danger)
    );

    const replyOptions = {
      embeds: [settingsEmbed],
      components: [actionRow1, actionRow2, actionRow3],
      flags: MessageFlags.Ephemeral
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(replyOptions);
    } else {
      await interaction.reply(replyOptions);
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
      }
    } catch (error) {
      console.error('Button interaction error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ 処理中にエラーが発生しました。',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  },

  async showChannelSelect(interaction, settingType, placeholder) {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`channel_select_${settingType}`)
      .setPlaceholder(placeholder)
      .addChannelTypes(ChannelType.GuildText);

    const actionRow = new ActionRowBuilder().addComponents(channelSelect);

    await interaction.reply({
      content: placeholder,
      components: [actionRow],
      flags: MessageFlags.Ephemeral
    });
  },

  async showRoleSelect(interaction, settingType, placeholder) {
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`role_select_${settingType}`)
      .setPlaceholder(placeholder);

    const actionRow = new ActionRowBuilder().addComponents(roleSelect);

    await interaction.reply({
      content: placeholder,
      components: [actionRow],
      flags: MessageFlags.Ephemeral
    });
  },

  async showTitleModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('default_title_modal')
      .setTitle('📝 既定タイトル設定');

    const titleInput = new TextInputBuilder()
      .setCustomId('default_title')
      .setLabel('既定のタイトルを入力してください')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100)
      .setPlaceholder('例: ゲーム募集 | {ゲーム名}');

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput)
    );

    await interaction.showModal(modal);
  },

  async showColorModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('default_color_modal')
      .setTitle('🎨 既定カラー設定');

    const colorInput = new TextInputBuilder()
      .setCustomId('default_color')
      .setLabel('カラーコードを入力してください（#なし）')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(6)
      .setMinLength(6)
      .setPlaceholder('例: 5865F2');

    modal.addComponents(
      new ActionRowBuilder().addComponents(colorInput)
    );

    await interaction.showModal(modal);
  },

  async handleSelectMenuInteraction(interaction) {
    const { customId, values } = interaction;
    
    console.log(`[guildSettings] handleSelectMenuInteraction called - customId: ${customId}, values:`, values);

    try {
      if (customId.startsWith('channel_select_')) {
        const settingType = customId.replace('channel_select_', '');
        const channelId = values[0];
        
        console.log(`[guildSettings] チャンネル選択 - settingType: ${settingType}, channelId: ${channelId}`);
        await this.updateGuildSetting(interaction, settingType, channelId);
      } else if (customId.startsWith('role_select_')) {
        const settingType = customId.replace('role_select_', '');
        const roleId = values[0];
        
        console.log(`[guildSettings] ロール選択 - settingType: ${settingType}, roleId: ${roleId}`);
        await this.updateGuildSetting(interaction, settingType, roleId);
      }
    } catch (error) {
      console.error('Select menu interaction error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ 設定の更新でエラーが発生しました。',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  },

  async handleModalSubmit(interaction) {
    const { customId } = interaction;

    try {
      if (customId === 'default_title_modal') {
        const title = interaction.fields.getTextInputValue('default_title');
        await this.updateGuildSetting(interaction, 'defaultTitle', title);
      } else if (customId === 'default_color_modal') {
        const color = interaction.fields.getTextInputValue('default_color');
        
        // カラーコードの検証
        if (color && !/^[0-9A-Fa-f]{6}$/.test(color)) {
          return await interaction.reply({
            content: '❌ 無効なカラーコードです。6桁の16進数（例: 5865F2）を入力してください。',
            flags: MessageFlags.Ephemeral
          });
        }
        
        await this.updateGuildSetting(interaction, 'defaultColor', color);
      }
    } catch (error) {
      console.error('Modal submit error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ 設定の更新でエラーが発生しました。',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  },

  async updateGuildSetting(interaction, settingKey, value) {
    try {
      const guildId = interaction.guildId;
      
      console.log(`[guildSettings] updateGuildSetting - guildId: ${guildId}, settingKey: ${settingKey}, value: ${value}`);
      
      // 設定をデータベースに保存
      const result = await saveGuildSettings(guildId, { [settingKey]: value });
      
      console.log(`[guildSettings] 設定保存結果:`, result);
      
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
        content: `✅ ${settingName}を更新しました！`,
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
      }, 2000);

    } catch (error) {
      console.error('Guild setting update error:', error);
      await interaction.reply({
        content: '❌ 設定の更新に失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async resetAllSettings(interaction) {
    try {
      const guildId = interaction.guildId;
      
      // すべての設定をリセット
      await saveGuildSettings(guildId, {
        recruitChannel: null,
        notificationRole: null,
        defaultTitle: null,
        defaultColor: null,
        updateChannel: null
      });
      
      await interaction.reply({
        content: '✅ すべての設定をリセットしました！',
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
      }, 2000);

    } catch (error) {
      console.error('Reset settings error:', error);
      await interaction.reply({
        content: '❌ 設定のリセットに失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};