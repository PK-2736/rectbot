const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    // ロール付与ボタンメッセージ送信処理
    const channelId = '1414751785272217745';
    const roleId = '1420235531442196562';
    const buttonCustomId = 'grant_role_1420235531442196562';
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('アップデート通知ロール')
      .setDescription('このロールはrectbotのアップデートや重要なお知らせを受け取るためのものです。\n\n下のボタンを押すと「アップデート通知用ロール」が付与されます。')
      .setColor(0x3b82f6)
      .setFooter({ text: '通知が不要になった場合はロールを外してください。' });

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('[ready.js] 指定チャンネルが見つからないかテキストチャンネルではありません');
        return;
      }

      // 直近50件からBot自身の同じカスタムIDボタンを含むメッセージを削除
      const messages = await channel.messages.fetch({ limit: 50 });
      for (const msg of messages.values()) {
        if (msg.author.id === client.user.id && msg.components.length > 0) {
          const hasTargetButton = msg.components.some(row =>
            row.components.some(btn => btn.customId === buttonCustomId)
          );
          if (hasTargetButton) {
            await msg.delete().catch(() => {});
          }
        }
      }

      // ボタン作成
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonCustomId)
          .setLabel('ロールを付与')
          .setStyle(ButtonStyle.Primary)
      );

  await channel.send({ embeds: [embed], components: [row] });
  console.log('[ready.js] ロール付与ボタンメッセージ(Embed)を送信しました');
    } catch (e) {
      console.error('[ready.js] ロール付与ボタンメッセージ送信エラー:', e);
    }
  },
};
