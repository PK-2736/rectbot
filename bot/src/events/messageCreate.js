const { EmbedBuilder } = require('discord.js');
const { normalizeGameNameWithWorker, getFriendCodesFromWorker } = require('../utils/workerApiClient');
const nodemailer = require('nodemailer');
const config = require('../config');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Botのメッセージは無視
    if (message.author.bot) return;

    // DMは無視
    if (!message.guild) return;

    // 特定チャンネルと特定ユーザーのメッセージ監視（bump通知）
    if (message.channel.id === '1414751550223548607' && message.author.id === '302050872383242240') {
      try {
        if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD || !config.NOTIFICATION_EMAIL_TO) {
          console.warn('[messageCreate] メール送信設定が環境変数に設定されていません');
          return;
        }

        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: config.GMAIL_USER,
            pass: config.GMAIL_APP_PASSWORD
          }
        });

        const mailOptions = {
          from: config.GMAIL_USER,
          to: config.NOTIFICATION_EMAIL_TO,
          subject: 'bump通知です',
          text: `ユーザー ${message.author.tag} がチャンネル ${message.channel.name} でメッセージを送信しました。\n\nメッセージ内容:\n${message.content}`
        };

        await transporter.sendMail(mailOptions);
        console.log(`[messageCreate] bump通知メール送信完了: ${message.author.tag}`);
      } catch (emailError) {
        console.error('[messageCreate] メール送信エラー:', emailError);
      }
    }

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

      // タイトルを作成: 正規化後の名前 (登録時の名前)
      // データベースのgame_nameが正規化後の名前
      const normalizedGameName = friendCode.game_name;
      let titleGameName = `🎮 ${normalizedGameName}`;
      if (friendCode.original_game_name && friendCode.original_game_name !== normalizedGameName) {
        titleGameName += ` (${friendCode.original_game_name})`;
      }

      // Embed を作成
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(titleGameName)
        .setDescription(`### ${user.username} のフレンドコード / ID\n\n\`\`\`\n${friendCode.friend_code}\n\`\`\``)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: `登録日: ${new Date(friendCode.created_at * 1000).toLocaleDateString('ja-JP')}` });

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
