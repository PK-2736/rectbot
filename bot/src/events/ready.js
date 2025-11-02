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
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('remove_role_1420235531442196562')
          .setLabel('ロールを外す')
          .setStyle(ButtonStyle.Secondary)
      );

  await channel.send({ embeds: [embed], components: [row] });
  console.log('[ready.js] ロール付与ボタンメッセージ(Embed)を送信しました');
    } catch (e) {
      console.error('[ready.js] ロール付与ボタンメッセージ送信エラー:', e);
    }

    // サポートサーバー: 1回限りの招待URLボタン設置
    // 要求: サポートサーバーのチャンネル 1434493999363653692 にボタンを設置
    const SUPPORT_CHANNEL_ID = '1434493999363653692';
    const SUPPORT_BUTTON_ID = 'one_time_support_invite';
    try {
      const supportChannel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
      if (!supportChannel || !supportChannel.isTextBased()) {
        console.error('[ready.js] サポートチャンネルが見つからないかテキストチャンネルではありません');
      } else {
        // 既存の同一ボタン付きメッセージを掃除
        const messages = await supportChannel.messages.fetch({ limit: 50 }).catch(() => null);
        if (messages) {
          for (const msg of messages.values()) {
            if (msg.author.id === client.user.id && msg.components.length > 0) {
              const hasTargetButton = msg.components.some(row =>
                row.components.some(btn => btn.customId === SUPPORT_BUTTON_ID)
              );
              if (hasTargetButton) {
                await msg.delete().catch(() => {});
              }
            }
          }
        }

        const { EmbedBuilder } = require('discord.js');
        const inviteEmbed = new EmbedBuilder()
          .setTitle('ボタンから招待URLを発行')
          .setDescription('下のボタンを押すと、このサポートチャンネルの「1回限りの招待URL」を発行します。リンクは1回使うと無効になります。')
          .setColor(0x16a34a);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(SUPPORT_BUTTON_ID)
            .setLabel('1回限りの招待URLを発行')
            .setStyle(ButtonStyle.Success)
        );

        await supportChannel.send({ embeds: [inviteEmbed], components: [row] });
        console.log('[ready.js] サポート招待ボタンメッセージを送信しました');
      }
    } catch (e) {
      console.error('[ready.js] サポート招待ボタン設置でエラー:', e);
    }
  },
};
