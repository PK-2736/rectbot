const { normalizeGameNameWithWorker, getFriendCodesFromWorker } = require('../utils/workerApiClient');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Botのメッセージは無視
    if (message.author.bot) return;

    // DMは無視
    if (!message.guild) return;

    // Botがメンションされているかチェック
    const botMention = `<@${client.user.id}>`;
    console.log(`[messageCreate] Message content: "${message.content}"`);
    console.log(`[messageCreate] Bot mention: ${botMention}`);
    console.log(`[messageCreate] Contains bot mention: ${message.content.includes(botMention)}`);
    
    if (!message.content.includes(botMention)) return;

    // メンションを除去してコンテンツを取得
    let content = message.content.replace(botMention, '').trim();
    console.log(`[messageCreate] Content after removing bot mention: "${content}"`);

    // ユーザーメンションを検出
    const userMentionRegex = /<@!?(\d+)>/g;
    const userMentions = [...content.matchAll(userMentionRegex)];
    console.log(`[messageCreate] User mentions found: ${userMentions.length}`);

    if (userMentions.length === 0) {
      // ユーザーメンションがない場合は終了
      return;
    }

    // ユーザーメンションを除去してゲーム名を取得
    const gameName = content.replace(userMentionRegex, '').trim();
    console.log(`[messageCreate] Game name: "${gameName}"`);

    if (!gameName) {
      await message.reply('❌ ゲーム名を指定してください。\n例: `@Bot valorant @ユーザー`');
      return;
    }

    try {
      // まず正規化前のゲーム名で検索を試みる
      let normalized = gameName;
      let shouldNormalize = false;

      // 各ユーザーで元の名前で登録されているか確認
      for (const match of userMentions) {
        const userId = match[1];
        const codes = await getFriendCodesFromWorker(userId, message.guild.id, gameName).catch(() => []);
        if (codes && codes.length > 0) {
          // 元の名前で見つかった場合は正規化不要
          shouldNormalize = false;
          break;
        } else {
          shouldNormalize = true;
        }
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

    // 各ユーザーのフレンドコードを取得
    const results = [];

    for (const match of userMentions) {
      const userId = match[1];

      try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) {
          results.push(`❌ <@${userId}>: ユーザーが見つかりません`);
          continue;
        }

        const codes = await getFriendCodesFromWorker(userId, message.guild.id, normalized);

        if (!codes || codes.length === 0) {
          results.push(`❌ ${user.username}: **${normalized}** は未登録`);
          continue;
        }

        const friendCode = codes[0];
        results.push(`✅ ${user.username} (${normalized}): \`${friendCode.friend_code}\``);

      } catch (error) {
        console.error(`[messageCreate] Error fetching friend code for user ${userId}:`, error);
        results.push(`❌ <@${userId}>: エラーが発生しました`);
      }
    }

    // 結果を送信
    let replyMessage = `🎮 **${normalized}** のフレンドコード:\n\n${results.join('\n')}`;

    if (result && result.method === 'ai' && result.confidence < 0.9) {
      replyMessage += `\n\n🤖 AI判定: 「${gameName}」→「${normalized}」(信頼度: ${(result.confidence * 100).toFixed(0)}%)`;
    }

    await message.reply(replyMessage);

    } catch (error) {
      console.error('[messageCreate] Error:', error);
      await message.reply('❌ Worker APIとの通信中にエラーが発生しました。');
    }
  }
};
