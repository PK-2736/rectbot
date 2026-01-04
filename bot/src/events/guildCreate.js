const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { saveGuildSettingsToRedis } = require('../utils/db');

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

      await channel.send({
        embeds: [embed],
        components: [buttons]
      });

      console.log(`[guildCreate] ウェルカムメッセージ送信完了: ${guild.name}`);

      // Webhook通知を送信（新サーバー招待時）
      try {
        const webhookUrl = 'https://discord.com/api/webhooks/1426044588740710460/RElua00Jvi-937tbGtwv9wfq123mdff097HvaJgb-qILNsc79yzei9x8vZrM2OKYsETI';
        
        const webhookEmbed = {
          title: '🎉 新しいサーバーに招待されました',
          color: parseInt('57F287', 16), // 緑色
          fields: [
            {
              name: 'サーバー名',
              value: guild.name,
              inline: true
            },
            {
              name: 'サーバーID',
              value: guild.id,
              inline: true
            },
            {
              name: 'メンバー数',
              value: `${guild.memberCount || 0}人`,
              inline: true
            },
            {
              name: '作成日',
              value: guild.createdAt ? `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:R>` : '不明',
              inline: true
            }
          ],
          timestamp: new Date().toISOString()
        };

        if (guild.iconURL()) {
          webhookEmbed.thumbnail = {
            url: guild.iconURL({ size: 256 })
          };
        }

        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [webhookEmbed]
          })
        });
        console.log('[webhook] 新サーバー招待通知を送信しました:', guild.id);
      } catch (webhookErr) {
        console.error('[webhook] 新サーバー招待通知の送信に失敗:', webhookErr?.message || webhookErr);
      }

    } catch (error) {
      console.error('[guildCreate] エラー:', error);
    }
  },
};