const { EmbedBuilder } = require('discord.js');
const { getFriendCodesFromWorker } = require('../utils/workerApiClient');
const nodemailer = require('nodemailer');
const config = require('../config');

// 2時間後のメール送信タイマーを管理
let bumpReminderTimer = null;

// メール送信関数
async function sendBumpNotification(channelName, content = '') {
  if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD || !config.NOTIFICATION_EMAIL_TO) {
    console.warn('[messageCreate] メール送信設定が環境変数に設定されていません');
    return;
  }

  try {
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
      text: content || `チャンネル ${channelName} で2時間が経過しました。`
    };

    await transporter.sendMail(mailOptions);
    console.log(`[messageCreate] bump通知メール送信完了`);
  } catch (emailError) {
    console.error('[messageCreate] メール送信エラー:', emailError);
  }
}

function isBumpNotificationChannel(message) {
  return message.channel.id === '1414751550223548607' && 
         message.author.id === '302050872383242240';
}

function cancelExistingBumpTimer() {
  if (bumpReminderTimer) {
    clearTimeout(bumpReminderTimer);
    console.log('[messageCreate] 既存の2時間タイマーをキャンセルしました');
  }
}

function scheduleBumpReminder(message) {
  const reminderDelay = 120 * 60 * 1000;
  bumpReminderTimer = setTimeout(() => {
    sendBumpNotification(
      message.channel.name,
      `2時間前にユーザー ${message.author.tag} がチャンネル ${message.channel.name} でメッセージを送信しました。\n\nメッセージ内容:\n${message.content}\n\n次のbumpの時間です！`
    );
    bumpReminderTimer = null;
  }, reminderDelay);
  console.log('[messageCreate] 2時間後のリマインダーを設定しました');
}

function handleBumpNotification(message) {
  cancelExistingBumpTimer();
  scheduleBumpReminder(message);
}

function extractAllMentions(content) {
  const mentionRegex = /<@!?(\d+)>/g;
  return [...content.matchAll(mentionRegex)];
}

function hasSelfMention(mentions, authorId) {
  return mentions.some(match => match[1] === authorId);
}

function extractGameName(content) {
  const mentionRegex = /<@!?(\d+)>/g;
  return content.replace(mentionRegex, '').trim();
}

function checkSelfMention(message) {
  const allMentions = extractAllMentions(message.content);
  const selfMention = hasSelfMention(allMentions, message.author.id);
  const gameName = extractGameName(message.content);
  return { selfMention, gameName };
}

function matchGameNameFuzzy(code, inputLower) {
  const gameLower = (code.original_game_name || code.game_name || '').toLowerCase();
  const normalizedLower = (code.game_name || '').toLowerCase();
  
  return gameLower === inputLower || 
         normalizedLower === inputLower ||
         gameLower.includes(inputLower) ||
         inputLower.includes(gameLower);
}

async function searchFriendCodesByGame(userId, guildId, gameName) {
  let friendCodes = await getFriendCodesFromWorker(userId, guildId, gameName).catch(() => []);

  if (!friendCodes || friendCodes.length === 0) {
    const allCodes = await getFriendCodesFromWorker(userId, guildId).catch(() => []);
    
    if (allCodes && allCodes.length > 0) {
      const inputLower = gameName.toLowerCase();
      const matched = allCodes.filter(code => matchGameNameFuzzy(code, inputLower));
      
      if (matched.length > 0) {
        friendCodes = matched;
      }
    }
  }

  return friendCodes;
}

function buildFriendCodeEmbed(friendCode, user) {
  const gameDisplayName = friendCode.original_game_name || friendCode.game_name;
  const titleGameName = `🎮 ${gameDisplayName}`;

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(titleGameName)
    .setDescription(`### ${user.username} のフレンドコード / ID\n\n\`\`\`\n${friendCode.friend_code}\n\`\`\``)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter({ text: `登録日: ${new Date(friendCode.created_at * 1000).toLocaleDateString('ja-JP')}` });
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    // DMは無視
    if (!message.guild) return;

    // 特定チャンネルと特定ユーザー（bot含む）のメッセージ監視（bump通知）
    if (isBumpNotificationChannel(message)) {
      handleBumpNotification(message);
    }

    // 以降はBotのメッセージは無視（フレンドコード検索機能）
    if (message.author.bot) return;

    // メンション検出とゲーム名抽出
    const { selfMention, gameName } = checkSelfMention(message);

    if (!selfMention) {
      return;
    }

    if (!gameName) {
      await message.reply('❌ ゲーム名を指定してください。\n例: `valorant @自分` または `apex @自分`');
      return;
    }

    try {
      const userId = message.author.id;
      const friendCodes = await searchFriendCodesByGame(userId, message.guild.id, gameName);

      if (!friendCodes || friendCodes.length === 0) {
        await message.reply(`❌ **${gameName}** のフレンドコードが登録されていません。\n\`/id_add\` コマンドで登録してください。`);
        return;
      }

      const friendCode = friendCodes[0];
      const embed = buildFriendCodeEmbed(friendCode, message.author);

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[messageCreate] Error:', error);
      await message.reply('❌ Worker APIとの通信中にエラーが発生しました。');
    }
  }
};
