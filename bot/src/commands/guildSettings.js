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
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');

const { saveGuildSettings, getGuildSettings, finalizeGuildSettings, startGuildSettingsSession } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildsettings')
    .setDescription('ギルドの募集設定を管理します')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      // 権限チェック
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await interaction.reply({
          content: '❌ この機能を使用するには「管理者」権限が必要です。',
          flags: MessageFlags.Ephemeral
        });
      }

      // 設定セッションを開始（SupabaseからKVに読み込み）
      console.log(`[guildSettings] 設定セッション開始 - guildId: ${interaction.guildId}`);
      
      try {
        await startGuildSettingsSession(interaction.guildId);
        console.log(`[guildSettings] セッション開始成功`);
      } catch (sessionError) {
        console.warn(`[guildSettings] セッション開始失敗、既存設定を使用: ${sessionError.message}`);
        // セッション開始に失敗しても続行（既存設定を使用）
      }
      
      // 現在の設定を取得（KVから）
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
    // ContainerBuilderを使用した新しいUI
    const container = new ContainerBuilder();
    container.setAccentColor(0x5865F2);

    // タイトル表示
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('⚙️ **ギルド募集設定**\n各項目をクリックして設定を変更できます')
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // 現在の設定表示
    const currentSettingsText = [
      '📋 **現在の設定**',
      '',
      `🏷️ **募集チャンネル**: ${settings.recruit_channel || settings.recruitmentChannelId ? `<#${settings.recruit_channel || settings.recruitmentChannelId}>` : '未設定'}`,
      `🔔 **通知ロール**: ${settings.notification_role || settings.recruitmentNotificationRoleId ? `<@&${settings.notification_role || settings.recruitmentNotificationRoleId}>` : '未設定'}`,
      `📝 **既定タイトル**: ${settings.defaultTitle || settings.defaultRecruitTitle || '未設定'}`,
      `🎨 **既定カラー**: ${settings.defaultColor || settings.defaultRecruitColor ? `${settings.defaultColor || settings.defaultRecruitColor}` : '未設定'}`,
      `📢 **アップデート通知チャンネル**: ${settings.update_channel || settings.updateNotificationChannelId ? `<#${settings.update_channel || settings.updateNotificationChannelId}>` : '未設定'}`
    ].join('\n');

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(currentSettingsText)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('🔧 **設定変更**\n下のボタンから設定したい項目を選択してください。')
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // 募集チャンネル設定ボタン
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('set_recruit_channel')
          .setLabel('📍 募集チャンネル設定')
          .setStyle(ButtonStyle.Primary)
      )
    );

    // 通知ロール設定ボタン
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('set_notification_role')
          .setLabel('🔔 通知ロール設定')
          .setStyle(ButtonStyle.Primary)
      )
    );

    // 既定タイトル設定ボタン
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('set_default_title')
          .setLabel('📝 既定タイトル設定')
          .setStyle(ButtonStyle.Primary)
      )
    );

    // 既定カラー設定ボタン
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('set_default_color')
          .setLabel('🎨 既定カラー設定')
          .setStyle(ButtonStyle.Primary)
      )
    );

    // アップデート通知チャンネル設定ボタン
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('set_update_channel')
          .setLabel('📢 アップデート通知チャンネル設定')
          .setStyle(ButtonStyle.Primary)
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // 制御ボタン
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('finalize_settings')
          .setLabel('✅ 設定完了')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('reset_all_settings')
          .setLabel('🔄 すべてリセット')
          .setStyle(ButtonStyle.Danger)
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('powered by **RectBot**')
    );

    const replyOptions = {
      components: [container],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
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
        case 'finalize_settings':
          await this.finalizeSettings(interaction);
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

      // 設定画面を即座に更新（保存結果の最新データを使用）
      setTimeout(async () => {
        try {
          // 保存結果から最新の設定を取得してUI更新
          const latestSettings = result.settings || {};
          console.log(`[guildSettings] UI更新用の最新設定:`, latestSettings);
          await this.showSettingsUI(interaction, latestSettings);
        } catch (error) {
          console.error('Settings UI update error:', error);
        }
      }, 1000);

    } catch (error) {
      console.error('Guild setting update error:', error);
      await interaction.reply({
        content: '❌ 設定の更新に失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async finalizeSettings(interaction) {
    try {
      const guildId = interaction.guildId;
      
      console.log(`[guildSettings] 設定を最終保存中 - guildId: ${guildId}`);
      console.log(`[guildSettings] バックエンドAPI URL: ${require('../config').BACKEND_API_URL}`);
      
      // セッション確保は不要 - 既にセッションが存在するはず
      // 古いデータを読み込み直すのを防ぐため、セッション確保をスキップ
      console.log(`[guildSettings] セッション確保をスキップ（既存セッションを使用）`);
      
      console.log(`[guildSettings] ファイナライゼーション処理開始...`);
      
      // KVからSupabaseに最終保存
      const result = await finalizeGuildSettings(guildId);
      
      console.log(`[guildSettings] 設定最終保存完了:`, result);
      
      // レスポンスメッセージを結果に応じて調整
      let message = '✅ 設定が保存されました！設定が有効になりました。';
      if (result && result.fallbackMode) {
        message = '✅ 設定が保存されました！（一時的にローカルストレージに保存）';
      } else if (result && result.supabaseSuccess) {
        message = '✅ 設定がデータベースに保存されました！設定が有効になりました。';
      }
      
      await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error('Finalize settings error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // より詳細なエラーメッセージ
      let errorMessage = '❌ 設定の保存に失敗しました。';
      if (error.message && error.message.includes('404')) {
        errorMessage += '\nセッションが見つかりません。設定を再度お試しください。';
      } else if (error.message && error.message.includes('500')) {
        errorMessage += '\nデータベース接続に問題があります。一時的に設定が保存されている可能性があります。';
      } else if (error.message && error.message.includes('fetch')) {
        errorMessage += '\nネットワーク接続に問題があります。接続を確認してください。';
      }
      
      errorMessage += `\n詳細: ${error.message}`;
      
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async resetAllSettings(interaction) {
    try {
      const guildId = interaction.guildId;
      
      // すべての設定をリセット
      const result = await saveGuildSettings(guildId, {
        recruit_channel: null,
        notification_role: null,
        defaultTitle: null,
        defaultColor: null,
        update_channel: null
      });
      
      console.log(`[guildSettings] すべての設定をリセットしました - guildId: ${guildId}`);
      console.log(`[guildSettings] リセット結果:`, result);
      
      await interaction.reply({
        content: '✅ すべての設定をリセットしました！',
        flags: MessageFlags.Ephemeral
      });

      // 設定画面を即座に更新（リセット結果の最新データを使用）
      setTimeout(async () => {
        try {
          // リセット後の設定を確実に反映
          const resetSettings = result.settings || {
            recruit_channel: null,
            notification_role: null,
            defaultTitle: null,
            defaultColor: null,
            update_channel: null,
            recruitmentChannelId: null,
            recruitmentNotificationRoleId: null,
            defaultRecruitTitle: '参加者募集',
            defaultRecruitColor: '#00FFFF',
            updateNotificationChannelId: null
          };
          console.log(`[guildSettings] リセット後のUI更新用設定:`, resetSettings);
          await this.showSettingsUI(interaction, resetSettings);
        } catch (error) {
          console.error('Settings UI update error:', error);
        }
      }, 1000);

    } catch (error) {
      console.error('Reset settings error:', error);
      await interaction.reply({
        content: '❌ 設定のリセットに失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};