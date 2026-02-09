const { EmbedBuilder } = require('discord.js');
const { normalizeGameNameWithWorker, getFriendCodesFromWorker } = require('../utils/workerApiClient');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // DMは無視
    if (!message.guild) return;

    // 以降はBotのメッセージは無視（フレンドコード検索機能）
    if (message.author.bot) return;

    // メッセージ全体からメンションを検出 (自分自身への言及のみ)
    const mentionRegex = /<@!?(\d+)>/g;
    const allMentions = [...message.content.matchAll(mentionRegex)];
    
    // quiet

    // メッセージ送信者が自分自身にメンションしているかチェック
    const hasSelfMention = allMentions.some(match => match[1] === message.author.id);

    if (!hasSelfMention) {
      // 自分自身へのメンションがない場合は終了
      return;
    }

    // すべてのメンションを除去してゲーム名を取得
    const gameName = message.content.replace(mentionRegex, '').trim();
    // quiet

    if (!gameName) {
      await message.reply('❌ ゲーム名を指定してください。\n例: `valorant @自分` または `apex @自分`');
      return;
    }

    try {
      const userId = message.author.id;
      
      // まず入力されたゲーム名でコードが登録されているか確認
      let friendCodes = await getFriendCodesFromWorker(userId, message.guild.id, gameName).catch(() => []);

      // マッチしない場合、すべてのゲームを取得して検索
      if (!friendCodes || friendCodes.length === 0) {
        const allCodes = await getFriendCodesFromWorker(userId, message.guild.id).catch(() => []);
        
        if (allCodes && allCodes.length > 0) {
          // 登録済みゲーム名から入力値とマッチするものを探す
          // 大文字小文字を区別しない検索
          const inputLower = gameName.toLowerCase();
          const matched = allCodes.filter(code => {
            const gameLower = (code.original_game_name || code.game_name || '').toLowerCase();
            const normalizedLower = (code.game_name || '').toLowerCase();
            
            // 完全一致、部分一致、正規化後の一致をチェック
            return gameLower === inputLower || 
                   normalizedLower === inputLower ||
                   gameLower.includes(inputLower) ||
                   inputLower.includes(gameLower);
          });
          
          if (matched.length > 0) {
            friendCodes = matched;
          }
        }
      }

      if (!friendCodes || friendCodes.length === 0) {
        await message.reply(`❌ **${gameName}** のフレンドコードが登録されていません。\n\`/id_add\` コマンドで登録してください。`);
        return;
      }

      const friendCode = friendCodes[0];
      const user = message.author;

      // タイトルを作成: 登録されたゲーム名をそのまま使用
      const gameDisplayName = friendCode.original_game_name || friendCode.game_name;
      const titleGameName = `🎮 ${gameDisplayName}`;

      // Embed を作成
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(titleGameName)
        .setDescription(`### ${user.username} のフレンドコード / ID\n\n\`\`\`\n${friendCode.friend_code}\n\`\`\``)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: `登録日: ${new Date(friendCode.created_at * 1000).toLocaleDateString('ja-JP')}` });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[messageCreate] Error:', error);
      await message.reply('❌ Worker APIとの通信中にエラーが発生しました。');
    }
  }
};
