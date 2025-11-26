const { getActiveRecruits } = require('./statusApi');
const { getParticipantsFromRedis } = require('./participants');

/**
 * 募集開始時間をチェックして通知を送信
 * @param {import('discord.js').Client} client - Discord.js Client
 */
async function checkAndNotifyStartTime(client) {
  if (!client || !client.isReady()) {
    console.log('[StartTimeNotifier] Client not ready, skipping check');
    return;
  }

  try {
    // すべてのアクティブな募集を取得
    const result = await getActiveRecruits();
    if (!result.ok || !result.body) {
      console.log(`[StartTimeNotifier] Failed to fetch active recruits: ${result.error || 'unknown error'}`);
      return;
    }
    
    const activeRecruits = result.body;
    if (!Array.isArray(activeRecruits) || activeRecruits.length === 0) {
      return;
    }

    const now = new Date();
    const jstOffset = 9 * 60; // JST is UTC+9
    const jstNow = new Date(now.getTime() + jstOffset * 60 * 1000);
    const currentHour = jstNow.getUTCHours();
    const currentMinute = jstNow.getUTCMinutes();
    const currentTimeStr = `${currentHour}:${currentMinute.toString().padStart(2, '0')}`;

    console.log(`[StartTimeNotifier] Checking ${activeRecruits.length} active recruits at JST ${currentTimeStr}`);

    for (const recruit of activeRecruits) {
      try {
        const recruitId = recruit.recruitId || recruit.message_id?.slice(-8);
        
        // 開始時間が設定されていない場合はスキップ
        if (!recruit.startTime) {
          continue;
        }

        console.log(`[StartTimeNotifier] Recruit ${recruitId}: startTime=${recruit.startTime}, notified=${recruit.startTimeNotified}`);

        // 既に通知済みの場合はスキップ
        if (recruit.startTimeNotified) {
          continue;
        }

        // 開始時間をパース (HH:mm または H:mm 形式)
        const timeParts = recruit.startTime.split(':');
        if (timeParts.length !== 2) {
          console.warn(`[StartTimeNotifier] Invalid time format for recruit ${recruitId}: ${recruit.startTime}`);
          continue;
        }
        
        const startHour = parseInt(timeParts[0], 10);
        const startMinute = parseInt(timeParts[1], 10);
        
        console.log(`[StartTimeNotifier] Comparing: current=${currentHour}:${currentMinute} vs start=${startHour}:${startMinute}`);
        
        // 現在時刻と比較(分単位で一致)
        if (currentHour === startHour && currentMinute === startMinute) {
          console.log(`[StartTimeNotifier] ✅ Triggering notification for recruit ${recruitId} at ${recruit.startTime}`);
          
          // 通知を送信
          await sendStartTimeNotification(client, recruit);
          
          // 通知済みフラグを立てる
          const { updateRecruitmentData } = require('./statusApi');
          await updateRecruitmentData(recruitId, { startTimeNotified: true });
          console.log(`[StartTimeNotifier] Notification sent and flag updated for recruit ${recruitId}`);
        }
      } catch (err) {
        console.error(`[StartTimeNotifier] Error processing recruit ${recruit.recruitId || recruit.message_id}:`, err);
      }
    }
  } catch (error) {
    console.error('[StartTimeNotifier] Error in checkAndNotifyStartTime:', error);
  }
}

/**
 * 開始時間の通知メッセージを送信
 * @param {import('discord.js').Client} client - Discord.js Client
 * @param {Object} recruit - 募集データ
 */
async function sendStartTimeNotification(client, recruit) {
  try {
    const recruitId = recruit.recruitId || recruit.id;
    const messageId = recruit.metadata?.messageId;
    const channelId = recruit.metadata?.channelId;
    const guildId = recruit.metadata?.guildId;
    const title = recruit.title || recruit.game || '募集';
    const vc = recruit.voice;
    const startTime = recruit.startTime;

    console.log(`[StartTimeNotifier] Sending notification for recruit ${recruitId} in channel ${channelId}`);

    // チャンネルを取得
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn(`[StartTimeNotifier] Channel ${channelId} not found or not text-based`);
      return;
    }

    // 参加者リストを取得 (messageIdを使用)
    const participantIds = await getParticipantsFromRedis(messageId).catch(() => []);
    console.log(`[StartTimeNotifier] Found ${participantIds.length} participants for recruit ${recruitId}`);
    
    // 参加者のメンション
    const participantMentions = participantIds.length > 0 
      ? participantIds.map(id => `<@${id}>`).join('\n')
      : 'なし';

    // ボイスチャット情報
    const voiceChannelId = recruit.metadata?.raw?.voiceChannelId;
    const voiceChannelName = recruit.metadata?.raw?.voiceChannelName;
    let voiceInfo = 'なし';
    let voiceLink = '';
    if (vc) {
      if (voiceChannelId && voiceChannelName) {
        voiceInfo = `あり (${voiceChannelName})`;
        voiceLink = `🔗 ボイスチャンネルに参加: <#${voiceChannelId}>`;
      } else if (voiceChannelName) {
        voiceInfo = `あり (${voiceChannelName})`;
      } else {
        voiceInfo = 'あり';
      }
    }

    // 日時フォーマット（JST）
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(now.getTime() + jstOffset);
    const dateStr = `${jstDate.getUTCFullYear()}/${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}/${String(jstDate.getUTCDate()).padStart(2, '0')} ${String(jstDate.getUTCHours()).padStart(2, '0')}:${String(jstDate.getUTCMinutes()).padStart(2, '0')}`;

    // 元のメッセージへのリンク
    const messageLink = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

    // 通知メッセージを構築
    const notificationLines = [
      '⏰ **開始時刻になりました！**',
      `**${title}** の募集開始時刻です。`,
      '',
      '**参加者**',
      participantMentions,
      '',
      '🔊 ボイスチャット',
      voiceInfo,
      '',
      dateStr,
      '',
    ];

    if (voiceLink) {
      notificationLines.push(voiceLink);
      notificationLines.push('');
    }

    notificationLines.push(`📋 募集の詳細: ${messageLink}`);

    const notificationContent = notificationLines.join('\n');

    await channel.send({
      content: notificationContent,
      allowedMentions: { users: participantIds }
    });
    
    console.log(`[StartTimeNotifier] Notification sent for recruit ${recruitId}`);
  } catch (error) {
    console.error(`[StartTimeNotifier] Error sending notification for recruit ${recruit.recruitId}:`, error);
  }
}

module.exports = {
  checkAndNotifyStartTime,
};
