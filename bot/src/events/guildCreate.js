const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    try {
      console.log(`[guildCreate] 新しいサーバーに参加: ${guild.name} (ID: ${guild.id})`);
      
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
        .setColor(0x5865F2)
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

    } catch (error) {
      console.error('[guildCreate] エラー:', error);
    }
  },
};