const { EmbedBuilder } = require('discord.js');
const { normalizeGameNameWithWorker, getFriendCodesFromWorker } = require('../utils/workerApiClient');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Botのメッセージは無視
    if (message.author.bot) return;

    // DMは無視
    if (!message.guild) return;

    // メッセージ全体からメンションを検出 (自分自身への言及のみ)
    const mentionRegex = /<@!?(\d+)>/g;
    const allMentions = [...message.content.matchAll(mentionRegex)];
    
    console.log(`[messageCreate] Message content: "${message.content}"`);
    console.log(`[messageCreate] All mentions: ${allMentions.map(m => m[1]).join(', ')}`);

    // メッセージ送信者が自分自身にメンションしているかチェック
    const hasSelfMention = allMentions.some(match => match[1] === message.author.id);

    if (!hasSelfMention) {
      // 自分自身へのメンションがない場合は終了
      return;
    }

    // すべてのメンションを除去してゲーム名を取得
    const gameName = message.content.replace(mentionRegex, '').trim();
    console.log(`[messageCreate] Game name: "${gameName}"`);

    if (!gameName) {
      await message.reply('❌ ゲーム名を指定してください。\n例: `valorant @自分` または `ばろ @自分`');
      return;
    }

    try {
      // まず正規化前のゲーム名で検索を試みる
      const userId = message.author.id;
      let normalized = gameName;
      let shouldNormalize = false;

      // 元の名前で登録されているか確認
      const codes = await getFriendCodesFromWorker(userId, message.guild.id, gameName).catch(() => []);
      if (!codes || codes.length === 0) {
        shouldNormalize = true;
      }

      let result = null;
      if (shouldNormalize) {
        // Worker AI でゲーム名を正規化
        result = await normalizeGameNameWithWorker(gameName, message.author.id, message.guild.id);
        normalized = result.normalized;

        if (!normalized) {
          await message.reply(`❌ ゲーム名「${gameName}」を認識できませんでした。`);
          return;
        }
      }

      // 自分のフレンドコードを取得
      const friendCodes = await getFriendCodesFromWorker(userId, message.guild.id, normalized);

      if (!friendCodes || friendCodes.length === 0) {
        await message.reply(`❌ **${normalized}** のフレンドコードが登録されていません。\n\`/link-add\` コマンドで登録してください。`);
        return;
      }

      const friendCode = friendCodes[0];
      const user = message.author;

      // Embed を作成
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🎮 ${normalized}`)
        .setDescription(`${user.username} のフレンドコード`)
        .addFields({
          name: 'フレンドコード',
          value: `\`${friendCode.friend_code}\``,
          inline: false
        })
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: `登録日: ${new Date(friendCode.created_at * 1000).toLocaleDateString('ja-JP')}` });

      // 登録時の名前が異なる場合は表示
      if (friendCode.original_game_name && friendCode.original_game_name !== normalized) {
        embed.addFields({
          name: '登録時のゲーム名',
          value: friendCode.original_game_name,
          inline: true
        });
      }

      // AI判定の場合は追加情報
      if (result && result.method === 'ai' && result.confidence < 0.9) {
        embed.addFields({
          name: '🤖 AI判定',
          value: `「${gameName}」→「${normalized}」\n信頼度: ${(result.confidence * 100).toFixed(0)}%`,
          inline: false
        });
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[messageCreate] Error:', error);
      await message.reply('❌ Worker APIとの通信中にエラーが発生しました。');
    }
  }
};
