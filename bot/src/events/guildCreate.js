const { 
  ContainerBuilder, 
  TextDisplayBuilder, 
  SeparatorBuilder, 
  SeparatorSpacingSize,
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  SectionBuilder 
} = require('discord.js');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    try {
      console.log(`新しいサーバーに参加しました: ${guild.name} (ID: ${guild.id})`);
      
      // サーバーのシステムチャンネルまたは最初のテキストチャンネルを取得
      const channel = guild.systemChannel || 
                     guild.channels.cache.find(ch => 
                       ch.type === 0 && // GUILD_TEXT
                       ch.permissionsFor(guild.members.me).has(['SendMessages', 'ViewChannel'])
                     );
      
      if (!channel) {
        console.log('ウェルカムメッセージを送信できるチャンネルが見つかりませんでした:', guild.name);
        return;
      }

      // Components v2でウェルカムメッセージを作成
      const welcomeContainer = new ContainerBuilder()
        .addComponents(
          new SectionBuilder()
            .addComponents(
              new TextDisplayBuilder()
                .setText('🎉 **RecruitBot（りくるぼ）** を導入いただきありがとうございます！')
                .setStyle('heading'),
              new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Small),
              new TextDisplayBuilder()
                .setText('ゲーム募集を簡単に作成・管理できるDiscordボットです。\n早速使い始めてみましょう！')
                .setStyle('paragraph')
            )
        );

      // ボタン行を作成
      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('welcome_help')
            .setLabel('📖 ヘルプを見る')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setURL('https://rectbot.tech')
            .setLabel('🌐 公式サイト')
            .setStyle(ButtonStyle.Link)
        );

      await channel.send({
        components: [welcomeContainer, buttonRow],
        allowedMentions: { roles: [], users: [] }
      });

      console.log(`ウェルカムメッセージを送信しました: ${channel.name} in ${guild.name}`);

    } catch (error) {
      console.error('ウェルカムメッセージの送信に失敗:', error);
    }
  },
};