const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { setDiscordClient } = require('../utils/db');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    // Register Discord client for start time notifications
    setDiscordClient(client);

    // ロール付与ボタンメッセージ送信処理
    const channelId = '1414751785272217745';
    const roleId = '1420235531442196562';
    const buttonCustomId = `grant_role_${roleId}`;
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('アップデート通知ロール')
      .setDescription('このロールはRecruboのアップデートや重要なお知らせを受け取るためのものです。\n\n下のボタンを押すと「アップデート通知用ロール」が付与されます。')
      .setColor(0xF97316)
      .setFooter({ text: '通知が不要になった場合はロールを外してください。' });

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('[ready.js] 指定チャンネルが見つからないかテキストチャンネルではありません');
        return;
      }

      // 直近50件からBot自身の同じカスタムIDボタンを含むメッセージを探す。
      // 見つかったら再送信はせず既存メッセージをそのまま使う（再起動で毎回送信されるのを防ぐ）。
      let existingMsg = null;
      const messages = await channel.messages.fetch({ limit: 50 });
      for (const msg of messages.values()) {
        if (msg.author.id === client.user.id && msg.components.length > 0) {
          const hasTargetButton = msg.components.some(row =>
            row.components.some(btn => btn.customId === buttonCustomId)
          );
          if (hasTargetButton) {
            existingMsg = msg;
            break;
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
          .setCustomId(`remove_role_${roleId}`)
          .setLabel('ロールを外す')
          .setStyle(ButtonStyle.Secondary)
      );

      if (!existingMsg) {
        await channel.send({ embeds: [embed], components: [row] });
        console.log('[ready.js] ロール付与ボタンメッセージ(Embed)を送信しました');
      } else {
        console.log('[ready.js] 既存のロール付与ボタンメッセージが見つかったため再送信をスキップしました');
      }
    } catch (e) {
      // ロール付与ボタン送信エラーは非必須なので、ログのみして処理は続行
      if (e.code === 50001 || e.code === 50013) {
        console.warn('[ready.js] ロール付与ボタンメッセージ送信: 権限不足 - スキップします');
      } else {
        console.error('[ready.js] ロール付与ボタンメッセージ送信エラー:', e?.message || e);
      }
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
        // 既存の同一ボタン付きメッセージが既にあるか確認し、あれば再送信をスキップする
        let existingSupportMsg = null;
        const messages = await supportChannel.messages.fetch({ limit: 50 }).catch(() => null);
        if (messages) {
          for (const msg of messages.values()) {
            if (msg.author.id === client.user.id && msg.components.length > 0) {
              const hasTargetButton = msg.components.some(row =>
                row.components.some(btn => btn.customId === SUPPORT_BUTTON_ID)
              );
              if (hasTargetButton) {
                existingSupportMsg = msg;
                break;
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

        if (!existingSupportMsg) {
          await supportChannel.send({ embeds: [inviteEmbed], components: [row] });
          console.log('[ready.js] サポート招待ボタンメッセージを送信しました');
        } else {
          console.log('[ready.js] 既存のサポート招待ボタンが見つかったため再送信をスキップしました');
        }
      }
    } catch (e) {
      // サポート招待ボタン送信エラーは非必須なので、ログのみして処理は続行
      if (e.code === 50001 || e.code === 50013) {
        console.warn('[ready.js] サポート招待ボタン設置: 権限不足 - スキップします');
      } else {
        console.error('[ready.js] サポート招待ボタン設置でエラー:', e?.message || e);
      }
    }
  },
};
