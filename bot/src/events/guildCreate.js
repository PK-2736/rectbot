const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { saveGuildSettingsToRedis } = require('../utils/database');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    try {
      console.log(`[guildCreate] 新しいサーバーに参加: ${guild.name} (ID: ${guild.id})`);
      
      // デフォルト募集設定を作成
      try {
        const defaultSettings = {
          recruit_channel: null, // 未設定
          notification_roles: ['everyone', 'here'], // everyone, here
          notification_role: 'everyone', // メインはeveryone
          defaultTitle: '参加者募集', // 規定タイトル
          defaultColor: null, // 未設定
          update_channel: null, // アップデート通知チャンネル: 未設定
        };
        await saveGuildSettingsToRedis(guild.id, defaultSettings);
        console.log(`[guildCreate] デフォルト募集設定を作成: ${guild.name} (ID: ${guild.id})`);
      } catch (settingsError) {
        console.error('[guildCreate] デフォルト設定の作成に失敗:', settingsError);
      }
      
      // 送信可能なチャンネルを探す
      let channel = guild.systemChannel;
      
      if (!channel) {
        channel = guild.channels.cache.find(ch => 
          ch.type === 0 && // GUILD_TEXT
          ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
        );
      }
      
      if (!channel) {
        console.log(`[guildCreate] 送信可能なチャンネルが見つかりません: ${guild.name}`);
        return;
      }

      console.log(`[guildCreate] 送信先: ${channel.name}`);

      // ウェルカムメッセージを作成
      const embed = new EmbedBuilder()
        .setColor(0xF97316)
        .setTitle('🎉 Recrubo を導入いただきありがとうございます！')
        .setDescription('ゲーム募集を簡単に作成・管理できるDiscordボットです。')
        .addFields({ name: '使い方', value: '下のボタンからヘルプやサポートを参照できます', inline: false })
        .setTimestamp();

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setURL('https://recrubo.net')
            .setLabel('🌐 公式サイト')
            .setStyle(ButtonStyle.Link),
          new ButtonBuilder()
            .setURL('https://recrubo.net/help')
            .setLabel('📖 ヘルプを見る')
            .setStyle(ButtonStyle.Link)
        );

      try {
        await channel.send({
          embeds: [embed],
          components: [buttons]
        });
        console.log(`[guildCreate] ウェルカムメッセージ送信完了: ${guild.name}`);
      } catch (sendError) {
        // 権限エラー時にサーバー所有者のDMにエラーメッセージを送信
        console.error(`[guildCreate] ウェルカムメッセージ送信エラー (${channel.name}):`, sendError);
        
        try {
          const owner = await guild.fetchOwner();
          const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Recrubo: チャンネル送信エラー')
            .setDescription(`サーバー「${guild.name}」でウェルカムメッセージの送信に失敗しました。`)
            .addFields(
              { name: 'エラーの原因', value: (() => {
                if (sendError.code === 50001) {
                  return 'チャンネルへのアクセス権限がありません。ボットのロールに「メッセージを送信」と「チャンネルを見る」の権限を付与してください。';
                } else if (sendError.code === 50013) {
                  return 'メッセージ送信権限が不足しています。ボットのロールに必要な権限を付与してください。';
                } else {
                  return `エラーコード: ${sendError.code}\nエラー: ${sendError.message}`;
                }
              })(), inline: false },
              { name: 'チャンネル', value: `#${channel.name}`, inline: true },
              { name: 'サーバーID', value: guild.id, inline: true }
            )
            .setFooter({ text: 'サポートが必要な場合は https://recrubo.net にアクセスしてください' })
            .setTimestamp();

          await owner.send({ embeds: [errorEmbed] });
          console.log(`[guildCreate] エラーメッセージをサーバー所有者に送信しました: ${guild.name}`);
        } catch (dmError) {
          console.error(`[guildCreate] サーバー所有者へのDM送信に失敗:`, dmError?.message || dmError);
        }
      }

    } catch (error) {
      console.error('[guildCreate] エラー:', error);
    }
  },
};