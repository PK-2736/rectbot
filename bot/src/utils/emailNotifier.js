const nodemailer = require('nodemailer');
const config = require('../config');

// 2時間30秒後のメール送信タイマーを管理
let bumpReminderTimer = null;

// メール送信関数
async function sendBumpNotification(channelName, content = '') {
  if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD || !config.NOTIFICATION_EMAIL_TO) {
    console.warn('[emailNotifier] メール送信設定が環境変数に設定されていません');
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
      text: content || `チャンネル ${channelName} で2時間30秒が経過しました。`
    };

    await transporter.sendMail(mailOptions);
    console.log(`[emailNotifier] bump通知メール送信完了`);
  } catch (emailError) {
    console.error('[emailNotifier] メール送信エラー:', emailError);
  }
}

// bump通知タイマーを設定する関数
function scheduleBumpNotification(userTag, channelName, content = '') {
  // 既存のタイマーがあればキャンセル
  if (bumpReminderTimer) {
    clearTimeout(bumpReminderTimer);
    console.log('[emailNotifier] 既存の2時間30秒タイマーをキャンセルしました');
  }

  // 2時間30秒後（7,230,000ミリ秒）にメール送信
  const reminderDelay = 120 * 60 * 1000 + 30 * 1000; // 2時間30秒
  bumpReminderTimer = setTimeout(() => {
    sendBumpNotification(
      channelName,
      `ユーザー ${userTag} がチャンネル ${channelName} でスラッシュコマンドを実行してから2時間30秒が経過しました。${content ? `\n\n${content}` : ''}\n\n次のbumpの時間です！`
    );
    bumpReminderTimer = null;
  }, reminderDelay);

  console.log(`[emailNotifier] 2時間30秒後のリマインダーを設定しました (ユーザー: ${userTag}, チャンネル: ${channelName})`);
}

module.exports = {
  sendBumpNotification,
  scheduleBumpNotification
};
