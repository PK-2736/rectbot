const { normalizeGameName } = require('../utils/gameNameNormalizer');
const { getFriendCode, searchFriendCodeByPattern } = require('../utils/db/friendCode');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Botのメッセージは無視
    if (message.author.bot) return;

    // DMは無視
    if (!message.guild) return;

    // Botがメンションされているかチェック
    const botMention = `<@${client.user.id}>`;
    if (!message.content.includes(botMention)) return;

    // メンションを除去してコンテンツを取得
    let content = message.content.replace(botMention, '').trim();

    // ユーザーメンションを検出
    const userMentionRegex = /<@!?(\d+)>/g;
    const userMentions = [...content.matchAll(userMentionRegex)];

    if (userMentions.length === 0) {
      // ユーザーメンションがない場合は終了
      return;
    }

    // ユーザーメンションを除去してゲーム名を取得
    const gameName = content.replace(userMentionRegex, '').trim();

    if (!gameName) {
      await message.reply('❌ ゲーム名を指定してください。\n例: `@Bot valorant @ユーザー`');
      return;
    }

    // ゲーム名を正規化
    const { normalized, confidence } = normalizeGameName(gameName);

    if (!normalized) {
      await message.reply(`❌ ゲーム名「${gameName}」を認識できませんでした。`);
      return;
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

        const friendCode = await getFriendCode(userId, message.guild.id, normalized);

        if (!friendCode) {
          // パターン検索で類似を探す
          const similar = await searchFriendCodeByPattern(userId, message.guild.id, gameName);
          
          if (similar.length > 0) {
            const suggestions = similar.map(s => `\`${s.gameName}\``).join(', ');
            results.push(`❌ ${user.username}: **${normalized}** は未登録 (似たゲーム: ${suggestions})`);
          } else {
            results.push(`❌ ${user.username}: **${normalized}** は未登録`);
          }
          continue;
        }

        results.push(`✅ ${user.username} (${normalized}): \`${friendCode.code}\``);
      } catch (error) {
        console.error(`[messageCreate] Error fetching friend code for user ${userId}:`, error);
        results.push(`❌ <@${userId}>: エラーが発生しました`);
      }
    }

    // 結果を送信
    let replyMessage = `🎮 **${normalized}** のフレンドコード:\n\n${results.join('\n')}`;

    if (confidence < 0.8) {
      replyMessage += `\n\n⚠️ 入力された「${gameName}」を「${normalized}」として検索しました。`;
    }

    await message.reply(replyMessage);
  }
};
